from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
import random

from .models import AppConfig, ExerciseStatus, ModeId, SamplePoint, TrailCurvePoint
from .scoring import clamp, linear_score, percent_error, reaction_score, smoothness_score


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _interp(points: list[TrailCurvePoint], steering_deg: float) -> float:
    if not points:
        return 0.0
    points = sorted(points, key=lambda item: item.steering_deg)
    abs_angle = abs(steering_deg)
    if abs_angle <= points[0].steering_deg:
        return points[0].brake_pct
    for left, right in zip(points, points[1:]):
        if abs_angle <= right.steering_deg:
            span = right.steering_deg - left.steering_deg
            if span <= 0:
                return right.brake_pct
            ratio = (abs_angle - left.steering_deg) / span
            return left.brake_pct + ratio * (right.brake_pct - left.brake_pct)
    return points[-1].brake_pct


@dataclass
class ExerciseOutcome:
    status: ExerciseStatus
    sample: SamplePoint
    completed: bool = False


class BaseExercise:
    title = ""
    objective = ""
    metric = ""
    difficulty = ""

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.started_at = _utc_now_iso()
        self.elapsed_ms = 0
        self.score = 0.0
        self.combo = 0
        self.history: list[SamplePoint] = []
        self.feedback = "Aguardando entrada."

    def start(self) -> None:
        self.started_at = _utc_now_iso()
        self.elapsed_ms = 0
        self.score = 0.0
        self.combo = 0
        self.history.clear()
        self.feedback = "Sessao iniciada."

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        raise NotImplementedError

    def status(self, mode_id: ModeId, target_pct: float = 0.0, target_visible: bool = True, target_label: str = "", progress_pct: float = 0.0, remaining_ms: int = 0, ideal_brake_pct: float = 0.0, ideal_steering_deg: float = 0.0) -> ExerciseStatus:
        return ExerciseStatus(
            mode_id=mode_id,
            title=self.title,
            objective=self.objective,
            metric=self.metric,
            difficulty=self.difficulty,
            feedback=self.feedback,
            target_pct=target_pct,
            target_visible=target_visible,
            target_label=target_label,
            progress_pct=progress_pct,
            score=clamp(self.score),
            combo=self.combo,
            elapsed_ms=self.elapsed_ms,
            remaining_ms=remaining_ms,
            ideal_brake_pct=ideal_brake_pct,
            ideal_steering_deg=ideal_steering_deg,
        )


class HoldTargetExercise(BaseExercise):
    title = "Hold Target"
    objective = "Manter a pressao do freio dentro da tolerancia."
    metric = "Precisao, tempo e oscilacao."
    difficulty = "Facil"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.target = random.choice([10, 22, 35, 45, 48, 70, 90])
        self.stable_ms = 0
        self.last_error = 0.0

    def start(self) -> None:
        super().start()
        self.target = random.choice([10, 22, 35, 45, 48, 70, 90])
        self.stable_ms = 0
        self.last_error = 0.0

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        error = percent_error(brake_pct, self.target)
        stable = error <= self.config.hold_tolerance_pct
        self.stable_ms = self.stable_ms + dt_ms if stable else 0
        if stable:
            self.combo += 1
        else:
            self.combo = max(0, self.combo - 1)
        precision = linear_score(error, span=10.0)
        smoothness = smoothness_score(brake_pct - self.last_error, scale=6.0)
        timing = clamp(100.0 * min(1.0, self.stable_ms / self.config.hold_time_ms))
        self.score = clamp(0.55 * precision + 0.25 * timing + 0.2 * smoothness)
        if self.stable_ms >= self.config.hold_time_ms:
            self.feedback = "Meta sustentada. Nova meta carregada."
            self.target = random.choice([10, 22, 35, 45, 48, 70, 90])
            self.stable_ms = 0
        else:
            self.feedback = "Segure a pressao sem oscilar."
        self.last_error = brake_pct
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, self.target, self.score, error, self.combo)
        self.history.append(sample)
        return ExerciseOutcome(self.status(ModeId.HOLD_TARGET, target_pct=self.target, progress_pct=self.stable_ms / self.config.hold_time_ms * 100.0), sample)


class BrakeModulationExercise(BaseExercise):
    title = "Brake Modulation"
    objective = "Seguir uma curva ondulada com o freio."
    metric = "Delay, erro medio, erro maximo, suavidade."
    difficulty = "Medio"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.time = 0
        self.peak_error = 0.0

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        self.time += dt_ms / 1000.0
        target = 40.0 + 40.0 * math.sin(self.time * 1.2)
        error = percent_error(brake_pct, target)
        self.peak_error = max(self.peak_error, error)
        delay_penalty = max(0.0, error - 5.0)
        smooth = smoothness_score(brake_pct - (self.history[-1].brake_pct if self.history else brake_pct), scale=4.0)
        precision = linear_score(error, span=35.0)
        self.score = clamp(0.6 * precision + 0.4 * smooth - delay_penalty * 0.25)
        self.feedback = "Siga a onda com minimo atraso."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, target, self.score, error, self.combo)
        self.history.append(sample)
        return ExerciseOutcome(self.status(ModeId.BRAKE_MODULATION, target_pct=target, progress_pct=(self.time % 6.0) / 6.0 * 100.0), sample)


class ThresholdBrakingExercise(BaseExercise):
    title = "Threshold Braking"
    objective = "Chegar em 95% o mais rapido possivel sem passar de 100%."
    metric = "Tempo de resposta, overshoot e consistencia."
    difficulty = "Medio"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.reached_at: int | None = None
        self.max_brake = 0.0

    def start(self) -> None:
        super().start()
        self.reached_at = None
        self.max_brake = 0.0

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        self.max_brake = max(self.max_brake, brake_pct)
        if self.reached_at is None and brake_pct >= 95.0:
            self.reached_at = self.elapsed_ms
        reaction = reaction_score(self.reached_at or self.elapsed_ms)
        overshoot = max(0.0, self.max_brake - 100.0)
        precision = linear_score(abs(100.0 - self.max_brake), span=8.0)
        self.score = clamp(0.5 * reaction + 0.5 * precision - overshoot * 2.0)
        self.feedback = "Brake forte, mas sem exceder 100%."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, 95.0, self.score, abs(brake_pct - 95.0), self.combo)
        self.history.append(sample)
        completed = brake_pct >= 95.0
        return ExerciseOutcome(self.status(ModeId.THRESHOLD_BRAKING, target_pct=95.0, progress_pct=clamp(brake_pct)), sample, completed=completed)


class RandomTargetExercise(BaseExercise):
    title = "Random Target"
    objective = "Responder rapido a alvos aleatorios."
    metric = "Reacao, precisao e consistencia."
    difficulty = "Medio"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.target = random.randint(10, 90)
        self.next_change_at = 1500
        self.reaction_started_at = 0
        self.reaction_done = False

    def start(self) -> None:
        super().start()
        self.target = random.randint(10, 90)
        self.next_change_at = 1500
        self.reaction_started_at = 0
        self.reaction_done = False

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        self.next_change_at -= dt_ms
        if self.next_change_at <= 0:
            self.target = random.randint(10, 90)
            self.next_change_at = random.randint(1000, 2500)
            self.reaction_started_at = self.elapsed_ms
            self.reaction_done = False
        error = percent_error(brake_pct, self.target)
        if not self.reaction_done and error <= 3.0 and self.reaction_started_at:
            self.reaction_done = True
            reaction = reaction_score(self.elapsed_ms - self.reaction_started_at)
        else:
            reaction = 0.0
        precision = linear_score(error, span=18.0)
        consistency = clamp(100.0 - sum(point.error_pct for point in self.history[-10:]) / max(1, min(10, len(self.history))))
        self.score = clamp(0.45 * precision + 0.35 * reaction + 0.2 * consistency)
        self.feedback = "Troque rapido entre os alvos."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, self.target, self.score, error, self.combo)
        self.history.append(sample)
        return ExerciseOutcome(self.status(ModeId.RANDOM_TARGET, target_pct=self.target, progress_pct=clamp(100.0 - self.next_change_at / 25.0)), sample)


class MemoryMuscleExercise(BaseExercise):
    title = "Memory Muscle Test"
    objective = "Memorizar o valor e reproduzir sem ajuda visual."
    metric = "Erro absoluto e consistencia."
    difficulty = "Medio"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.target = random.randint(10, 90)
        self.show_remaining = config.memory_show_ms
        self.hidden = False

    def start(self) -> None:
        super().start()
        self.target = random.randint(10, 90)
        self.show_remaining = self.config.memory_show_ms
        self.hidden = False

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        self.show_remaining = max(0, self.show_remaining - dt_ms)
        self.hidden = self.show_remaining <= 0
        visible = not self.hidden
        error = percent_error(brake_pct, self.target)
        precision = linear_score(error, span=12.0)
        consistency = clamp(100.0 - error)
        self.score = clamp(0.7 * precision + 0.3 * consistency)
        self.feedback = "Memorize o valor" if visible else "Reproduza o alvo de memoria."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, self.target if visible else 0.0, self.score, error, self.combo)
        self.history.append(sample)
        if self.hidden and error <= self.config.hold_tolerance_pct:
            self.combo += 1
        return ExerciseOutcome(self.status(ModeId.MEMORY_MUSCLE_TEST, target_pct=self.target, target_visible=visible, progress_pct=clamp(100.0 - self.show_remaining / self.config.memory_show_ms * 100.0)), sample)


class TrailBrakingExercise(BaseExercise):
    title = "Trail Braking Trainer"
    objective = "Reduzir o freio conforme o volante gira."
    metric = "Aderencia a curva e fluidez."
    difficulty = "Dificil"

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        ideal = _interp(self.config.trail_curve, steering_deg)
        error = percent_error(brake_pct, ideal)
        self.combo = self.combo + 1 if error <= 4.0 else max(0, self.combo - 1)
        adherence = linear_score(error, span=20.0)
        smooth = smoothness_score(brake_pct - (self.history[-1].brake_pct if self.history else brake_pct), scale=5.0)
        coord = linear_score(percent_error(abs(steering_deg), 0.0), span=180.0)
        self.score = clamp(0.6 * adherence + 0.2 * smooth + 0.2 * coord)
        self.feedback = "Mais volante = menos freio."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, ideal, self.score, error, self.combo)
        self.history.append(sample)
        return ExerciseOutcome(self.status(ModeId.TRAIL_BRAKING_TRAINER, target_pct=ideal, ideal_brake_pct=ideal, ideal_steering_deg=steering_deg), sample)


class CornerEntryExercise(BaseExercise):
    title = "Corner Entry Trainer"
    objective = "Frear forte, modular e soltar progressivamente."
    metric = "Curva ideal, trail braking e suavidade."
    difficulty = "Dificil"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.distance_marks = [100, 75, 50, 25]
        self.phase = 0

    def start(self) -> None:
        super().start()
        self.phase = 0

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        self.phase = min(len(self.distance_marks) - 1, self.elapsed_ms // 1500)
        ideal = [100.0, 85.0, 55.0, 25.0][self.phase]
        error = percent_error(brake_pct, ideal)
        self.score = clamp(0.7 * linear_score(error, span=16.0) + 0.3 * smoothness_score(brake_pct - (self.history[-1].brake_pct if self.history else brake_pct), scale=7.0))
        self.feedback = f"Fase {self.distance_marks[self.phase]}m: pressione ideal aproximadamente {ideal:.0f}%."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, ideal, self.score, error, self.combo)
        self.history.append(sample)
        return ExerciseOutcome(self.status(ModeId.CORNER_ENTRY_TRAINER, target_pct=ideal, target_label=f"{self.distance_marks[self.phase]}m"), sample)


class ChicaneChallengeExercise(BaseExercise):
    title = "Chicane Challenge"
    objective = "Sincronizar freio e volante em sequencias esquerda/direita."
    metric = "Coordenacao e fluidez."
    difficulty = "Dificil"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.sequence = ["Left", "Right", "Left"]
        self.phase = 0

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        phase_duration = 2000
        self.phase = min(2, self.elapsed_ms // phase_duration)
        target_steer = [-40.0, 40.0, -20.0][self.phase]
        target_brake = [65.0, 45.0, 30.0][self.phase]
        steering_error = percent_error(steering_deg, target_steer)
        brake_error = percent_error(brake_pct, target_brake)
        coord = linear_score((steering_error + brake_error) / 2.0, span=22.0)
        smooth = smoothness_score(brake_pct - (self.history[-1].brake_pct if self.history else brake_pct), scale=6.0)
        self.score = clamp(0.7 * coord + 0.3 * smooth)
        self.feedback = f"Sequencia {self.sequence[self.phase]}: freio e volante juntos."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, target_brake, self.score, (steering_error + brake_error) / 2.0, self.combo)
        self.history.append(sample)
        return ExerciseOutcome(self.status(ModeId.CHICANE_CHALLENGE, target_pct=target_brake, ideal_brake_pct=target_brake, ideal_steering_deg=target_steer, target_label=self.sequence[self.phase]), sample)


class BrakeRhythmExercise(BaseExercise):
    title = "Brake Rhythm"
    objective = "Acertar a pressao no tempo da batida."
    metric = "Combos, multiplos e ranking."
    difficulty = "Dificil"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.beat_ms = 750
        self.window_ms = 180
        self.next_beat_at = self.beat_ms
        self.combo_multiplier = 1

    def start(self) -> None:
        super().start()
        self.next_beat_at = self.beat_ms
        self.combo_multiplier = 1

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        self.next_beat_at -= dt_ms
        if self.next_beat_at <= 0:
            self.next_beat_at = self.beat_ms
            self.combo_multiplier = min(10, self.combo_multiplier + 1)
        beat_progress = 100.0 - clamp(abs(self.next_beat_at) / self.beat_ms * 100.0)
        target = 70.0 if beat_progress < 20.0 else 30.0
        error = percent_error(brake_pct, target)
        timed = 100.0 if abs(self.next_beat_at) <= self.window_ms else 35.0
        self.score = clamp(0.5 * linear_score(error, span=18.0) + 0.5 * timed) * (1.0 + self.combo_multiplier / 20.0)
        self.combo = self.combo_multiplier
        self.feedback = "Acerte a batida e mantenha o combo."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, target, self.score, error, self.combo)
        self.history.append(sample)
        return ExerciseOutcome(self.status(ModeId.BRAKE_RHYTHM, target_pct=target, progress_pct=beat_progress, target_label=f"x{self.combo_multiplier}"), sample)


class QualifyingChallengeExercise(BaseExercise):
    title = "Qualifying Challenge"
    objective = "Misturar exercicios em uma sessao de 2 minutos."
    metric = "Nota geral, consistencia e ranking."
    difficulty = "Master"

    def __init__(self, config: AppConfig) -> None:
        super().__init__(config)
        self.submodes: list[ModeId] = [
            ModeId.HOLD_TARGET,
            ModeId.BRAKE_MODULATION,
            ModeId.THRESHOLD_BRAKING,
            ModeId.TRAIL_BRAKING_TRAINER,
            ModeId.RANDOM_TARGET,
        ]
        self.sub_index = 0
        self.sub_started_at = 0

    def start(self) -> None:
        super().start()
        self.sub_index = 0
        self.sub_started_at = 0

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        self.elapsed_ms += dt_ms
        if self.elapsed_ms >= self.config.qualifying_duration_ms:
            self.feedback = "Sessao concluida."
        if self.elapsed_ms // 12000 > self.sub_index and self.sub_index < len(self.submodes) - 1:
            self.sub_index += 1
        submode = self.submodes[self.sub_index]
        if submode == ModeId.HOLD_TARGET:
            target = 45.0
        elif submode == ModeId.BRAKE_MODULATION:
            target = 40.0 + 40.0 * math.sin(self.elapsed_ms / 900.0)
        elif submode == ModeId.THRESHOLD_BRAKING:
            target = 95.0
        elif submode == ModeId.TRAIL_BRAKING_TRAINER:
            target = max(0.0, 100.0 - abs(steering_deg) / max(1.0, self.config.wheel_range_deg) * 100.0)
        elif submode == ModeId.RANDOM_TARGET:
            target = random.choice([18, 26, 41, 73, 88])
        else:
            target = 50.0
        error = percent_error(brake_pct, target)
        precision = linear_score(error, span=20.0)
        streak = min(100.0, len([item for item in self.history[-12:] if item.error_pct <= 6.0]) * 10.0)
        self.score = clamp(0.75 * precision + 0.25 * streak)
        self.feedback = f"Bloco {submode.value.replace('_', ' ')}."
        sample = SamplePoint(self.elapsed_ms, brake_pct, steering_deg, target, self.score, error, self.combo)
        self.history.append(sample)
        completed = self.elapsed_ms >= self.config.qualifying_duration_ms
        return ExerciseOutcome(self.status(ModeId.QUALIFYING_CHALLENGE, target_pct=target, progress_pct=self.elapsed_ms / self.config.qualifying_duration_ms * 100.0, target_label=submode.value), sample, completed=completed)


EXERCISE_FACTORIES: dict[ModeId, type[BaseExercise]] = {
    ModeId.HOLD_TARGET: HoldTargetExercise,
    ModeId.BRAKE_MODULATION: BrakeModulationExercise,
    ModeId.THRESHOLD_BRAKING: ThresholdBrakingExercise,
    ModeId.RANDOM_TARGET: RandomTargetExercise,
    ModeId.MEMORY_MUSCLE_TEST: MemoryMuscleExercise,
    ModeId.TRAIL_BRAKING_TRAINER: TrailBrakingExercise,
    ModeId.CORNER_ENTRY_TRAINER: CornerEntryExercise,
    ModeId.CHICANE_CHALLENGE: ChicaneChallengeExercise,
    ModeId.BRAKE_RHYTHM: BrakeRhythmExercise,
    ModeId.QUALIFYING_CHALLENGE: QualifyingChallengeExercise,
}


class TrainingSession:
    def __init__(self, config: AppConfig, mode_id: ModeId) -> None:
        self.config = config
        self.mode_id = mode_id
        self.exercise = EXERCISE_FACTORIES[mode_id](config)
        self.exercise.start()
        self.completed = False

    def step(self, brake_pct: float, steering_deg: float, dt_ms: int) -> ExerciseOutcome:
        outcome = self.exercise.step(brake_pct, steering_deg, dt_ms)
        self.completed = outcome.completed
        return outcome

    def status(self) -> ExerciseStatus:
        last = self.exercise.history[-1] if self.exercise.history else SamplePoint(0, 0.0, 0.0, 0.0, 0.0, 0.0, 0)
        return self.exercise.status(self.mode_id, target_pct=last.target_pct, progress_pct=0.0)

    def samples(self) -> list[SamplePoint]:
        return list(self.exercise.history)
