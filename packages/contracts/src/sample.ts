import type { CourseDetail, Lesson, Mcq } from './index.js';

export const SAMPLE_TEMPLATE_ID = 'web-foundations' as const;
const stableId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const courseId = stableId(1);
const question = (text: string, correct: string, incorrect: string, explanation: string): Mcq => ({
  question: text,
  options: [correct, incorrect],
  correctAnswerIndex: 0,
  explanation,
});
const entries = [
  {
    title: 'What happens when you open a website?',
    description: 'Follow a page from its server to the browser in front of you.',
    objectives: [
      'Explain the client–server relationship',
      'Identify the roles of HTML, CSS, and JavaScript',
    ],
    topics: ['Browsers', 'Servers', 'The request–response cycle'],
    heading: 'A conversation across the internet',
    text: 'Your browser is a client. When you enter a web address, it requests a resource from a server. The server responds with data, often an HTML document. The browser parses that document and may request stylesheets, scripts, and images before displaying the page.',
    detail:
      'HTML describes the structure and meaning of content. CSS controls its appearance and layout. JavaScript adds behavior. These three technologies cooperate, but a useful page can start with HTML alone. Network speed, resource size, and the amount of work a browser performs all affect when you can use the page.',
    language: 'html',
    code: '<!doctype html>\n<html lang="en">\n  <head><title>My first page</title></head>\n  <body><h1>Hello, web!</h1></body>\n</html>',
    takeaway:
      'Open your browser’s developer tools and inspect the Network panel. Each row represents a request; the initial HTML document is only the beginning.',
    resource:
      'https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Web_standards/How_the_web_works',
    quiz: [
      question(
        'Which program acts as the client when you browse a website?',
        'The web browser',
        'The database server',
        'The browser requests resources and presents the response to you.',
      ),
      question(
        'What is the main job of HTML?',
        'Describe content structure and meaning',
        'Store user passwords',
        'HTML gives a document its semantic structure.',
      ),
      question(
        'What usually follows the first HTML response?',
        'Requests for related resources',
        'The server directly paints your screen',
        'The browser discovers links to images, scripts, and styles and requests them.',
      ),
      question(
        'Which technology adds page behavior?',
        'JavaScript',
        'CSS selectors alone',
        'JavaScript can respond to events and update the document.',
      ),
    ],
  },
  {
    title: 'Give content a meaningful structure',
    description: 'Use HTML elements to tell readers and browsers what your content means.',
    objectives: ['Choose semantic HTML elements', 'Connect a label to a form input'],
    topics: ['Semantic HTML', 'Headings', 'Accessible forms'],
    heading: 'Structure is a feature',
    text: 'Semantic elements describe the purpose of content. A main element marks the primary content, nav holds navigation links, and a button represents an action. These meanings help browsers, assistive technology, and the people maintaining your code.',
    detail:
      'Use headings in a logical hierarchy. A visible form label should be connected to its input using matching for and id attributes. Choose an anchor for navigation and a button for an action. Native elements provide keyboard behavior that a clickable div would require you to recreate.',
    language: 'html',
    code: '<main>\n  <h1>Your learning library</h1>\n  <label for="topic">What would you like to learn?</label>\n  <input id="topic" name="topic" type="text" />\n  <button type="button">Save topic</button>\n</main>',
    takeaway:
      'Try navigating a page with only Tab, Shift+Tab, and Enter. Every interactive element should remain reachable and understandable.',
    resource: 'https://developer.mozilla.org/en-US/docs/Glossary/Semantics',
    quiz: [
      question(
        'Which element represents a page action?',
        'button',
        'div',
        'A button supplies a native interactive role and keyboard support.',
      ),
      question(
        'What connects a label and an input?',
        'Matching for and id attributes',
        'Putting them in the same stylesheet',
        'The association gives the input an accessible label.',
      ),
      question(
        'What should headings express?',
        'The logical content hierarchy',
        'Only the size of the text',
        'Headings describe sections; CSS can change their visual size.',
      ),
      question(
        'Which element should navigate to another URL?',
        'An anchor with href',
        'A paragraph with a click handler',
        'Anchors provide link semantics and browser navigation behavior.',
      ),
    ],
  },
  {
    title: 'Style a page that adapts',
    description: 'Understand the box model and build a layout that works on small screens.',
    objectives: ['Describe the CSS box model', 'Use flexible layout instead of fixed page widths'],
    topics: ['CSS', 'Box model', 'Responsive layout'],
    heading: 'Every element is a box',
    text: 'The CSS box model includes content, padding, border, and margin. With box-sizing: border-box, a declared width includes padding and border. This makes element sizes easier to reason about when laying out a page.',
    detail:
      'Flexible layouts adapt to the space available. Grid can place cards into columns and flexbox can arrange controls along a row. A media query applies styles when a condition matches, such as a narrow viewport. Always test with long text and avoid relying on one ideal screen size.',
    language: 'css',
    code: '* { box-sizing: border-box; }\n.library {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));\n  gap: 24px;\n}\n.card { padding: 24px; border: 1px solid #ddd; }',
    takeaway:
      'A responsive page should fit without horizontal scrolling. Check both narrow widths and zoomed text.',
    resource: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Box_model/Introduction',
    quiz: [
      question(
        'What does border-box include in a declared width?',
        'Content, padding, and border',
        'Content and outer margin',
        'Margins remain outside the border box.',
      ),
      question(
        'What does a media query do?',
        'Applies styles when a condition matches',
        'Changes a server database',
        'Viewport conditions are a common use for media queries.',
      ),
      question(
        'Why use flexible columns?',
        'They adapt to available space',
        'They guarantee all text has the same length',
        'Content and viewport sizes vary, so the layout must accommodate them.',
      ),
      question(
        'Which is a useful mobile check?',
        'Look for horizontal overflow',
        'Only test a full-width desktop window',
        'Overflow often reveals fixed widths or content that cannot wrap.',
      ),
    ],
  },
  {
    title: 'Think in JavaScript values',
    description: 'Use values, functions, and arrays to describe small pieces of behavior.',
    objectives: [
      'Write a function with an explicit return value',
      'Use an array to represent a sequence',
    ],
    topics: ['Values', 'Functions', 'Arrays'],
    heading: 'From information to behavior',
    text: 'JavaScript values include strings, numbers, booleans, objects, and arrays. A variable names a value. A function groups a task so that it can be reused with different inputs. Using const prevents reassignment of the binding; it does not make every object immutable.',
    detail:
      'Arrays are ordered collections. Methods such as map transform each item into a new array, while filter selects items that match a condition. Keep small functions focused on a single task, and decide what should happen when input is missing or invalid.',
    language: 'javascript',
    code: 'const lessons = ["HTML", "CSS", "JavaScript"];\n\nfunction describeLesson(title) {\n  return `Learn the foundations of ${title}`;\n}\n\nconst descriptions = lessons.map(describeLesson);',
    takeaway:
      'A function that returns a value is easier to reuse than one that silently changes unrelated state.',
    resource: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
    quiz: [
      question(
        'What does array.map produce?',
        'A new array of transformed items',
        'A new database table',
        'map calls the callback for array elements and returns the mapped array.',
      ),
      question(
        'What does const prevent?',
        'Reassigning the binding',
        'All mutations of a referenced object',
        'An object held by a const binding can still be mutated.',
      ),
      question(
        'What does return do in a function?',
        'Provides a result and ends that invocation',
        'Repeats the function indefinitely',
        'The caller receives the returned value.',
      ),
      question(
        'Which structure represents an ordered collection?',
        'An array',
        'A single boolean',
        'Arrays preserve the order of their elements.',
      ),
    ],
  },
  {
    title: 'Meet the document object model',
    description: 'Read and update a page through the browser’s DOM API.',
    objectives: ['Find an element with a selector', 'Update text without injecting HTML'],
    topics: ['DOM', 'Selectors', 'Safe text rendering'],
    heading: 'Your document, represented as a tree',
    text: 'The document object model, or DOM, represents a document as objects arranged in a tree. JavaScript can read attributes, change text, add elements, and react to events through browser APIs. The DOM is the current document representation, which may differ from the original HTML response.',
    detail:
      'querySelector returns the first matching element or null. Always account for a missing match. Use textContent for plain text. Injecting untrusted strings through innerHTML can introduce security vulnerabilities; textContent treats the string as text rather than markup.',
    language: 'javascript',
    code: 'const heading = document.querySelector("h1");\n\nif (heading) {\n  heading.textContent = "Welcome to your library";\n}',
    takeaway:
      'Treat user and AI content as data. Display it as text unless you have a specific, safely validated rendering pipeline.',
    resource: 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model',
    quiz: [
      question(
        'What is the DOM?',
        'An object representation of a document',
        'A password encryption algorithm',
        'Browser code can inspect and update this document tree.',
      ),
      question(
        'What can querySelector return if nothing matches?',
        'null',
        'An automatic new element',
        'A missing element must be handled explicitly.',
      ),
      question(
        'Which property is appropriate for untrusted plain text?',
        'textContent',
        'innerHTML',
        'textContent does not interpret its value as HTML markup.',
      ),
      question(
        'Can the DOM differ from the initial HTML?',
        'Yes, scripts can update it',
        'No, the document is permanently fixed',
        'Scripts and browser behavior can change the live DOM.',
      ),
    ],
  },
  {
    title: 'Respond to user actions',
    description: 'Listen for events and make controls behave predictably.',
    objectives: ['Register an event listener', 'Explain when preventDefault is useful'],
    topics: ['Events', 'Listeners', 'Forms'],
    heading: 'Make the interaction explicit',
    text: 'An event describes something that happened, such as a click, a key press, or a form submission. addEventListener registers a callback to run when an event reaches the element. Semantic controls such as buttons already support expected keyboard interactions.',
    detail:
      'Some events have default browser actions. Submitting a form may navigate away; preventDefault lets your application handle the submission instead. Distinguish this from stopPropagation, which affects how an event travels through the document tree. Provide visible feedback while an action is in progress.',
    language: 'javascript',
    code: 'const form = document.querySelector("form");\n\nform?.addEventListener("submit", (event) => {\n  event.preventDefault();\n  // Validate fields, then perform the requested action.\n});',
    takeaway:
      'Handle a form’s submit event so that keyboard submission and clicking the submit button follow the same path.',
    resource: 'https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener',
    quiz: [
      question(
        'What does addEventListener register?',
        'A callback for an event',
        'A permanent database schema',
        'The callback runs when the chosen event occurs.',
      ),
      question(
        'What does preventDefault affect?',
        'The event’s default browser action',
        'All unrelated events on the page',
        'It can prevent default form navigation when handling submission.',
      ),
      question(
        'Which event covers a form submitted with Enter?',
        'submit',
        'Only mousemove',
        'The submit event supports several ways to submit a form.',
      ),
      question(
        'Why give visible feedback after a click?',
        'So users understand the action’s state',
        'To replace input validation',
        'Feedback helps users distinguish loading, success, and failure.',
      ),
    ],
  },
  {
    title: 'Ask an API for data',
    description: 'Use fetch and handle unsuccessful responses deliberately.',
    objectives: ['Read a JSON response', 'Handle HTTP errors and network failures'],
    topics: ['HTTP', 'fetch', 'JSON'],
    heading: 'A response is more than its body',
    text: 'An HTTP response includes a status and a body. fetch resolves to a Response when the server returns a response, even for many unsuccessful HTTP statuses. Check response.ok before treating the response as a successful result.',
    detail:
      'Network failures can reject the fetch promise. JSON parsing can fail too. A good interface represents loading, empty, ready, and error states instead of leaving a spinner on screen indefinitely. AbortController can cancel work that is no longer needed when the user navigates away.',
    language: 'javascript',
    code: 'async function loadCourses() {\n  const response = await fetch("/api/courses");\n  if (!response.ok) {\n    throw new Error("Could not load courses");\n  }\n  return response.json();\n}',
    takeaway:
      'A 404 response and a dropped connection are different failures. Both deserve a clear message and a useful next step.',
    resource: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch',
    quiz: [
      question(
        'Does fetch always reject for an HTTP 404?',
        'No, check response.ok',
        'Yes, every HTTP error rejects automatically',
        'fetch can resolve with an unsuccessful HTTP response.',
      ),
      question(
        'What does response.json do?',
        'Parses the response body as JSON',
        'Validates every application-specific field',
        'JSON parsing checks JSON syntax, not your domain schema.',
      ),
      question(
        'What can AbortController help with?',
        'Cancelling an obsolete request',
        'Encrypting all database rows',
        'Cancellation reduces unnecessary work after navigation.',
      ),
      question(
        'Which state belongs in a data-loading UI?',
        'A useful error and retry state',
        'An endless spinner after every failure',
        'Users need a way to recover when loading fails.',
      ),
    ],
  },
  {
    title: 'Choose where data belongs',
    description: 'Distinguish temporary UI state, browser storage, and server persistence.',
    objectives: [
      'Choose storage based on a data requirement',
      'Explain why sensitive tokens need care',
    ],
    topics: ['State', 'Browser storage', 'Persistence'],
    heading: 'Lifetime and ownership guide the choice',
    text: 'Local component state suits short-lived interface details, such as an expanded panel. Browser storage can preserve some preferences across refreshes, but belongs to a specific browser context. A database lets an application persist owned records and retrieve them from another device after sign-in.',
    detail:
      'Anything accessible to page JavaScript can be exposed by malicious scripts running in that page. Do not casually store sensitive tokens in localStorage. Authorization must be enforced by the server for each record; hiding a button in the UI does not protect the data.',
    language: 'javascript',
    code: '// A harmless display preference, not an access token.\nlocalStorage.setItem("preferred-theme", "light");\nconst theme = localStorage.getItem("preferred-theme");',
    takeaway:
      'A saved course should belong to a verified user on the server. The browser sends a request; the server decides whether that user may read or change the record.',
    resource: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API',
    quiz: [
      question(
        'Where should access to an owned course be enforced?',
        'On the server for each request',
        'Only by hiding a frontend link',
        'A user can call an API directly, bypassing the interface.',
      ),
      question(
        'What is a suitable use for local component state?',
        'Whether a navigation panel is open',
        'Durable cross-device course ownership',
        'Temporary interface state does not need a server record.',
      ),
      question(
        'Can browser JavaScript read localStorage?',
        'Yes',
        'No, it is always hidden from scripts',
        'This is why sensitive values require careful storage decisions.',
      ),
      question(
        'What supports signed-in access from multiple devices?',
        'Server-side persistence',
        'A variable in one browser tab',
        'The database outlives a single tab and can serve authorized devices.',
      ),
    ],
  },
  {
    title: 'Put the pieces together',
    description: 'Build a small learning page and check the whole user journey.',
    objectives: [
      'Connect structure, presentation, and behavior',
      'Check success and failure paths',
    ],
    topics: ['Integration', 'Accessibility', 'Verification'],
    heading: 'A useful page is a complete journey',
    text: 'Start with a small goal: show a list of lessons and let a reader open one. Use semantic HTML for structure, responsive CSS for layout, and JavaScript for interactions. Make every action clear and ensure the page still communicates useful information while data is loading or unavailable.',
    detail:
      'Verify more than the happy path. Open a deep link directly, refresh it, try a narrow screen, and navigate with a keyboard. Test an empty list and a failed request. An application works when users can complete their task reliably, not merely when its code compiles.',
    language: 'html',
    code: '<section aria-labelledby="lessons-title">\n  <h2 id="lessons-title">Your lessons</h2>\n  <ul>\n    <li><a href="/lessons/stable-id">Open a lesson</a></li>\n  </ul>\n</section>',
    takeaway:
      'Make a checklist for the user journey: enter, navigate, refresh, recover from failure, and leave. Test each step on desktop and mobile.',
    resource: 'https://developer.mozilla.org/en-US/docs/Learn_web_development',
    quiz: [
      question(
        'What should a deep-link refresh do?',
        'Load the intended screen',
        'Depend on having opened the homepage first',
        'Users should be able to enter the app at a valid route.',
      ),
      question(
        'What does a successful build prove?',
        'The build completed',
        'Every real user journey works',
        'Functional and browser checks provide additional evidence.',
      ),
      question(
        'Which is an important failure path?',
        'An API request returning an error',
        'Only the ideal successful response',
        'Recoverable errors are part of a complete user experience.',
      ),
      question(
        'Why use stable IDs in lesson links?',
        'Links survive ordering changes',
        'Array indexes never change',
        'Identity should remain stable even when ordering changes.',
      ),
    ],
  },
];

export const sampleLessons: Lesson[] = entries.map((entry, index) => ({
  id: stableId(100 + index),
  moduleId: stableId(10 + Math.floor(index / 3)),
  courseId,
  position: index % 3,
  title: entry.title,
  description: entry.description,
  objectives: entry.objectives,
  keyTopics: entry.topics,
  resources: [{ title: 'Read more on MDN Web Docs', url: entry.resource, source: 'catalogue' }],
  generationState: 'ready',
  contentVersion: 1,
  contentHash: null,
  content: {
    blocks: [
      { type: 'heading', text: entry.heading },
      { type: 'paragraph', text: entry.text },
      { type: 'paragraph', text: entry.detail },
      { type: 'code', language: entry.language, code: entry.code },
      { type: 'callout', title: 'Try it yourself', text: entry.takeaway },
    ],
    quiz: entry.quiz.map((item, questionIndex) =>
      questionIndex % 2 === 0
        ? item
        : {
            ...item,
            options: [...item.options].reverse(),
            correctAnswerIndex: item.options.length - 1,
          },
    ),
  },
}));

const moduleEntries = [
  {
    title: 'Meet the web',
    description: 'Understand the browser, structure your content, and create an adaptable layout.',
  },
  {
    title: 'Make it interactive',
    description: 'Use JavaScript, the document model, and events to bring a page to life.',
  },
  {
    title: 'Connect the pieces',
    description: 'Load data, choose its home, and verify a complete experience.',
  },
];

export const sampleCourse: CourseDetail = {
  id: courseId,
  title: 'Web foundations: from browser to build',
  description:
    'Understand how a website works, then connect HTML, CSS, and JavaScript in a small, accessible experience. An authored sample to explore the learning format.',
  tags: ['Web development', 'Beginner'],
  isSample: true,
  generationState: 'ready',
  moduleCount: 3,
  lessonCount: 9,
  completedLessonCount: 0,
  completedLessonIds: [],
  createdAt: '2026-10-05T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
  modules: moduleEntries.map((entry, index) => ({
    ...entry,
    id: stableId(10 + index),
    courseId,
    position: index,
    lessons: sampleLessons
      .slice(index * 3, index * 3 + 3)
      .map(
        ({ content: _content, contentHash: _hash, contentVersion: _version, ...metadata }) =>
          metadata,
      ),
  })),
};
