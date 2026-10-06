// Authored provider outputs for deterministic tests/evaluation. Never production fallback.
import type { GeneratedLessonContent, OutlineDraft } from '@text-to-learn/contracts';
import type {
  GenerationProvider,
  GenerationRequest,
} from '../../server/src/providers/generation.js';

function outline(
  title: string,
  description: string,
  modules: { title: string; lessons: string[] }[],
  catalogueId: string,
  subject: string,
): OutlineDraft {
  return {
    title,
    description,
    tags: [subject, 'beginner'],
    modules: modules.map((module) => ({
      title: module.title,
      description: `Build understanding through ${module.lessons.join(', ')}.`,
      lessons: module.lessons.map((lesson) => ({
        title: lesson,
        description: `Study ${lesson.toLowerCase()} with examples, then apply the idea in a short practice task.`,
        objectives: [
          `Explain ${lesson.toLowerCase()} using a concrete example`,
          `Apply ${lesson.toLowerCase()} in a practice task`,
        ],
        keyTopics: [lesson, subject],
        resources: [
          { catalogueId, title: `${subject} reference` },
          { catalogueId: null, title: `Practice exercises about ${lesson.toLowerCase()}` },
        ],
      })),
    })),
  };
}
const question = (
  question: string,
  options: string[],
  correctAnswerIndex: number,
  explanation: string,
) => ({ question, options, correctAnswerIndex, explanation });
export const evaluationCases: {
  topic: string;
  outline: OutlineDraft;
  lesson: GeneratedLessonContent;
}[] = [
  {
    topic: 'Python for beginners',
    outline: outline(
      'Python: from values to small programs',
      'Learn core Python concepts before applying them in a small command-line program. This beginner course focuses on values, control flow and reusable functions.',
      [
        {
          title: 'Values and expressions',
          lessons: ['Values and types', 'Names and assignment', 'Expressions and input'],
        },
        {
          title: 'Control flow and collections',
          lessons: ['Conditions and decisions', 'Lists and loops', 'Dictionaries and lookup'],
        },
        {
          title: 'Reusable programs',
          lessons: [
            'Functions and return values',
            'Errors and debugging',
            'Build a small quiz program',
          ],
        },
      ],
      'python-tutorial',
      'Python',
    ),
    lesson: {
      blocks: [
        { type: 'heading', text: 'Values carry types' },
        {
          type: 'paragraph',
          text: 'A value is a piece of data. Python has integers such as 3, floating-point numbers such as 3.5, strings such as "hello", and booleans True and False. The type affects which operations make sense. A variable name refers to an object; the name does not permanently fix the object type.',
        },
        {
          type: 'code',
          language: 'python',
          code: "count = 3\nprice = 3.5\nname = \"Ada\"\nis_ready = True\nprint(type(count))  # <class 'int'>\nprint(type(name))   # <class 'str'>",
        },
        { type: 'heading', text: 'Choose operations deliberately' },
        {
          type: 'paragraph',
          text: 'Adding two integers produces a number. Adding two strings joins their text. Adding an integer to a string raises TypeError; convert deliberately when a numeric value should become text. For example, str(3) + " apples" produces "3 apples". A numeral inside quotes is still a string.',
        },
        {
          type: 'callout',
          title: 'Try it',
          text: 'Predict the types of 7, "7", 7.0 and False. Then use type() to check each prediction. Explain why "7" + "2" produces "72" rather than 9.',
        },
      ],
      videoQueries: ['Python beginner values types integers strings booleans'],
      quiz: [
        question(
          'What is the type of "7"?',
          ['Integer', 'String', 'Boolean'],
          1,
          'Quotes make "7" a string, even though its character is a numeral.',
        ),
        question(
          'What does "7" + "2" produce?',
          ['"72"', '9', 'True'],
          0,
          'The + operator joins strings. Both operands are strings, so their characters are concatenated.',
        ),
        question(
          'Which expression safely creates the text "3 apples"?',
          ['3 + " apples"', 'int(" apples")', 'str(3) + " apples"'],
          2,
          'str(3) creates a string that can be joined to the string " apples".',
        ),
        question(
          'Which built-in reveals the type of a value?',
          ['input()', 'type()', 'print() always returns it'],
          1,
          'type(value) returns its type. print displays values and input reads a string.',
        ),
      ],
    },
  },
  {
    topic: 'Persuasive writing',
    outline: outline(
      'Persuasive writing: from audience to revision',
      'Write evidence-based arguments for a defined audience. Move from purpose and claims to support, counterarguments and revision.',
      [
        {
          title: 'Plan a clear argument',
          lessons: ['Audience and purpose', 'Claims and scope', 'Organize a thesis'],
        },
        {
          title: 'Support your reasoning',
          lessons: [
            'Evidence and credibility',
            'Link evidence to claims',
            'Address counterarguments',
          ],
        },
        {
          title: 'Draft and improve',
          lessons: ['Paragraph coherence', 'Tone and clarity', 'Revise a complete argument'],
        },
      ],
      'purdue-essays',
      'Writing',
    ),
    lesson: {
      blocks: [
        { type: 'heading', text: 'Write for a reader and a purpose' },
        {
          type: 'paragraph',
          text: 'Persuasive writing asks a reader to accept a claim or consider an action. Before drafting, identify who the reader is, what they already know, and what change you seek. An audience analysis is a working hypothesis, not permission to stereotype readers or distort evidence.',
        },
        { type: 'heading', text: 'Match reasons to the decision' },
        {
          type: 'paragraph',
          text: 'Imagine proposing longer library hours to a school committee. Your purpose is a specific scheduling decision. Relevant reasons might include student access and staffing costs. A general claim that libraries are good does not address that decision. Describe a bounded proposal and the evidence needed to evaluate it.',
        },
        {
          type: 'callout',
          title: 'Practice',
          text: 'Write one sentence naming your audience, one stating the action you seek, and two questions that reader would reasonably ask before agreeing.',
        },
        {
          type: 'paragraph',
          text: 'Revise the proposal when reader questions reveal gaps. Respectful tone supports clear communication, but tone cannot replace credible evidence. Treat objections as opportunities to test the argument.',
        },
      ],
      videoQueries: ['persuasive writing audience purpose argument planning'],
      quiz: [
        question(
          'What should you identify before drafting?',
          [
            'A fixed essay length only',
            'The audience and intended purpose',
            'The strongest sounding adjective',
          ],
          1,
          'Knowing the reader and desired decision helps select relevant reasons and evidence.',
        ),
        question(
          'Which purpose is most specific?',
          [
            'Libraries are interesting',
            'Everyone should love reading',
            'Ask the committee to extend Friday library hours',
          ],
          2,
          'The scheduling proposal states an audience and a concrete action.',
        ),
        question(
          'What makes staffing costs relevant to the proposal?',
          [
            'They affect whether longer hours are feasible',
            'They prove every library is alike',
            'They replace all student evidence',
          ],
          0,
          'A committee evaluating longer hours needs to consider feasibility alongside student access.',
        ),
        question(
          'How should a writer treat reasonable objections?',
          ['Hide them', 'Use them to test and improve the argument', 'Assume the reader is wrong'],
          1,
          'Objections can expose missing evidence or reasoning and lead to a stronger argument.',
        ),
      ],
    },
  },
  {
    topic: 'World history',
    outline: outline(
      'World history to 1500: evidence, societies and connections',
      'A selective introduction to world history through 1500. Compare evidence, early societies and regional connections; this course does not claim to cover every place or event.',
      [
        {
          title: 'Read the evidence',
          lessons: [
            'Sources and historical questions',
            'Chronology and context',
            'Agriculture and settlement',
          ],
        },
        {
          title: 'Compare early societies',
          lessons: [
            'River valleys and cities',
            'Power and social organization',
            'Beliefs and cultural exchange',
          ],
        },
        {
          title: 'Connections and change',
          lessons: [
            'Trade networks across regions',
            'Regional changes through 1500',
            'Compare societies with evidence',
          ],
        },
      ],
      'openstax-history',
      'History',
    ),
    lesson: {
      blocks: [
        { type: 'heading', text: 'Ask a question of the past' },
        {
          type: 'paragraph',
          text: 'History builds explanations from evidence. Written records, objects, buildings and oral traditions can all contribute. A primary source comes from the period or event being studied; a secondary source interprets evidence later. These categories depend on the research question, and neither guarantees truth or neutrality.',
        },
        { type: 'heading', text: 'Read sources in context' },
        {
          type: 'paragraph',
          text: 'A ruler’s inscription may explain how the ruler wanted to be remembered. It does not by itself show what every resident experienced. Ask who created the source, when, for whom and for what purpose. Compare it with other records and material evidence before drawing a broader conclusion.',
        },
        {
          type: 'callout',
          title: 'Practice a cautious inference',
          text: 'Suppose an inscription celebrates a victory. Write one claim the inscription directly supports and one question that needs additional evidence. Separate what the source says from what actually happened.',
        },
        {
          type: 'paragraph',
          text: 'Gaps in surviving evidence limit conclusions. An absence of a record is not proof that an event never happened. Good historical reasoning states uncertainty and compares alternative explanations rather than presenting a single surviving source as a complete picture.',
        },
      ],
      videoQueries: ['historical sources primary secondary context evidence introduction'],
      quiz: [
        question(
          'What makes a source primary for a historical question?',
          [
            'It is always accurate',
            'It comes from the period or event under study',
            'It is a modern textbook',
          ],
          1,
          'A primary source is connected to the period or event, but still needs critical evaluation.',
        ),
        question(
          'What does a ruler’s victory inscription directly reveal?',
          [
            'How the ruler presented the victory',
            'Every resident’s opinion',
            'That no other evidence is needed',
          ],
          0,
          'An inscription directly records a representation of the event; broader claims require corroboration.',
        ),
        question(
          'Which question helps contextualize a source?',
          [
            'Is it the longest source?',
            'Can its purpose be ignored?',
            'Who created it and for which audience?',
          ],
          2,
          'Creator, audience, date and purpose help explain how and why a source was produced.',
        ),
        question(
          'What follows from a missing written record?',
          [
            'The event definitely never happened',
            'The evidence is incomplete and needs careful interpretation',
            'All surviving sources are false',
          ],
          1,
          'A gap limits certainty. It does not automatically prove or disprove an event.',
        ),
      ],
    },
  },
];
export class FixtureGenerationProvider implements GenerationProvider {
  readonly model = 'fixture-text-v1';
  readonly available = true;
  calls: GenerationRequest[] = [];
  constructor(private delayMs = 0) {}
  async generate(request: GenerationRequest): Promise<unknown> {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.calls.push(request);
    const context = request.context as { topic?: string; curriculum?: { title: string } };
    const topic = context.topic ?? context.curriculum?.title ?? '';
    if (
      topic.startsWith('Retry generation test') &&
      this.calls.filter((call) => (call.context as { topic?: string }).topic === topic).length <= 2
    )
      return { invalid: true };
    const selected =
      evaluationCases.find((item) => topic === item.topic || topic === item.outline.title) ??
      evaluationCases[0]!;
    if (request.kind === 'course' && topic.startsWith('Lesson retry test'))
      return { ...structuredClone(selected.outline), title: topic };
    if (request.kind === 'course' && topic.startsWith('Enhancement retry test')) {
      const draft = structuredClone(selected.outline);
      draft.title = topic;
      draft.modules[0]!.lessons[0]!.title = 'Enhancement retry test: Values and types';
      return draft;
    }
    if (
      request.kind === 'lesson' &&
      topic.startsWith('Lesson retry test') &&
      this.calls.filter(
        (call) =>
          call.kind === 'lesson' &&
          (call.context as { curriculum?: { title: string } }).curriculum?.title === topic,
      ).length <= 2
    )
      return { invalid: true };
    return structuredClone(request.kind === 'course' ? selected.outline : selected.lesson);
  }
}
