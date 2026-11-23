// @ts-check
// No live numbers here: the air changes daily, the voice must never contradict the screen.
/** @typedef {keyof typeof LINES} LineId */
/**
 * A narration line, and when (ms from the start of the recording) it starts.
 * @typedef {{ id: LineId; at: number }} Cue
 */
/** @typedef {Partial<Record<LineId, number>>} Durations each prepared line's spoken length, in seconds */

export const LINES = {
  d_intro:
    'Every winter, smog turns the air in our cities into something like smoking. Saans is a Gen A I assistant that helps families breathe less of it, and pollute less too.',
  d_search: 'Just search for your city, or use your location.',
  d_air:
    'Saans reads live air quality for your area, and explains it in plain words, including what breathing it all day really means.',
  d_ribbon:
    'The ribbon shows the next twenty four hours: the best time to step out, and when the family should stay in.',
  d_plan: 'Then it builds a plan for your household. These three things matter most today.',
  d_why: 'Every tip shows its direct impact, and exactly how it was worked out. No guesswork, just real numbers.',
  d_impact:
    'Follow the plan, and your family breathes far less smog each day, while avoiding kilograms of carbon dioxide every month.',
  d_more:
    'There is more: low emission routines, indoor air fixes, greener swaps, and steps your whole community can take.',
  d_household: 'Change your household details, and the plan adapts instantly.',
  d_coal: 'Heating with coal? A carbon monoxide safety warning jumps straight to the top.',
  d_ask: 'Ask Saans explains your plan with Google Gemini, using only the numbers you see on screen.',
  d_answer: 'The answer is personal, grounded, and easy to act on.',
  d_question: 'You can ask anything, like whether it is safe for the kids to play outside this evening.',
  d_answer2: 'It answers directly, and points to the safest time to go out.',
  // English only: given a mixed English + Hindi line, the TTS model spoke just the Hindi half.
  d_hindi: 'And the whole app works in Hindi too.',
  d_outro: 'Saans. Breathe cleaner, emit less. Accessible, secure, fully tested, and free to run.',
  m_intro: 'Smog season? Meet Saans, your family’s clean air companion.',
  m_search: 'Pick your city.',
  m_air: 'See today’s air, explained simply.',
  m_ribbon: 'Know the best time to go out, and when to stay in.',
  m_steps: 'Get the three steps that matter most.',
  m_impact: 'And see your impact: cleaner lungs, less carbon.',
  m_ask: 'Ask Saans, powered by Google Gemini.',
  m_answer: 'Personal answers, grounded in real numbers.',
  m_hindi: 'In English, and in Hindi.',
  m_outro: 'Saans. Breathe cleaner, emit less.',
};
