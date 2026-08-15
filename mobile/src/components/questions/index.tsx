/**
 * Question rendering, split from the players that host it.
 *
 * Before this existed, `quiz/[sessionId].tsx` mapped `question.options` into
 * buttons directly, which quietly assumed every question is multiple choice.
 * That assumption is the thing blocking Parsons problems, Spot the Bug and
 * Match Pairs — none of which are a list of options.
 *
 * So the two axes are separated here: a **game mode** decides the rules of a
 * run (lives, clock, stakes), a **question kind** decides how one question is
 * presented. They are orthogonal — a Survival run should be able to contain a
 * Parsons problem — and adding a format now means adding a file in this folder
 * and one line to the switch below, not touching either player.
 *
 * Colour arrives as a prop rather than an import because the two lanes have
 * genuinely different palettes. One component, two worlds, no duplication.
 */

import React from 'react';

import type { AnswerResponse, PlayableQuestion } from '../../lib/database.types';
import { colors } from '../../theme';
import { arcade } from '../../theme/arcade';
import { Txt } from '../ui';
import { ChoiceQuestion } from './ChoiceQuestion';

export interface QuestionPalette {
  surface: string;
  line: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  /** Chosen, before the answer is revealed. */
  selected: string;
  selectedDim: string;
  correct: string;
  correctDim: string;
  wrong: string;
  wrongDim: string;
  codeBg: string;
  codeInk: string;
}

export const focusPalette: QuestionPalette = {
  surface: colors.surface,
  line: colors.line,
  ink: colors.ink,
  inkSoft: colors.inkSoft,
  inkFaint: colors.inkFaint,
  selected: colors.accent,
  selectedDim: colors.accentDim,
  correct: colors.correct,
  correctDim: colors.correctDim,
  wrong: colors.wrong,
  wrongDim: colors.wrongDim,
  codeBg: colors.bg,
  codeInk: colors.accentInk,
};

export const arcadePalette: QuestionPalette = {
  surface: arcade.surface,
  line: arcade.line,
  ink: arcade.ink,
  inkSoft: arcade.inkSoft,
  inkFaint: arcade.inkFaint,
  selected: arcade.energy,
  selectedDim: arcade.energyDim,
  correct: arcade.win,
  correctDim: arcade.winDim,
  wrong: arcade.hot,
  wrongDim: arcade.hotDim,
  codeBg: arcade.bg,
  codeInk: arcade.energyInk,
};

export interface QuestionViewProps {
  question: PlayableQuestion;
  palette: QuestionPalette;
  /** Set once the player has committed, which freezes input and shows truth. */
  revealed: boolean;
  chosenId: string | null;
  onAnswer: (response: AnswerResponse) => void;
}

export function QuestionRenderer(props: QuestionViewProps) {
  switch (props.question.kind) {
    case 'single_choice':
    case 'true_false':
    case 'code_output':
      return <ChoiceQuestion {...props} />;

    default:
      // Content is authored server-side and approved independently of app
      // releases, so a question in a format this build does not know about is
      // a normal thing to meet, not a crash. Say so plainly and let the run
      // continue rather than dropping the player into a red screen.
      return (
        <Txt variant="body" tone="soft">
          This question needs a newer version of the app. Update to play it.
        </Txt>
      );
  }
}

export { ChoiceQuestion };
