import { createQuestion, type Question } from './model';
import { randomPracticeSeed, retryPracticeSeed } from './seeds';

/** UI-only progression: preserve the generator contract and avoid consecutive duplicate problems. */
export function nextQuestion(current: Question, seed: string = randomPracticeSeed()): Question {
  const previous = JSON.stringify(current.problem);
  for (let i = 0; i < 32; i++) {
    const question = createQuestion(current.kind, retryPracticeSeed(seed,i), current.recipe.difficulty, current.recipe.version);
    if (question.id !== current.id && JSON.stringify(question.problem) !== previous) return question;
  }
  throw Error('No distinct variant available');
}
