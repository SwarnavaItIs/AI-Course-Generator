import type { Lesson, Video } from '@text-to-learn/contracts';

export type ExportBlock = {
  id: string;
  kind: 'title' | 'heading' | 'text' | 'code';
  text: string;
  href?: string;
};
export type ExportFragment = {
  blockId: string;
  start: number;
  end: number;
  text: string;
  top: number;
  bottom: number;
};
export type ExportManifest = {
  blocks: ExportBlock[];
  pages: { number: number; fragments: ExportFragment[] }[];
  pageWidth: number;
  pageHeight: number;
  bodyHeight: number;
};
const WIDTH = 794,
  HEIGHT = 1123,
  MARGIN = 54,
  BODY_HEIGHT = HEIGHT - MARGIN * 2 - 48;

export function lessonExportBlocks(lesson: Lesson, videos: Video[]): ExportBlock[] {
  if (!lesson.content || lesson.generationState !== 'ready')
    throw new Error('The lesson must be ready before exporting.');
  const blocks: Omit<ExportBlock, 'id'>[] = [
    { kind: 'title', text: lesson.title },
    { kind: 'text', text: lesson.description },
    { kind: 'heading', text: 'Learning objectives' },
    ...lesson.objectives.map((text) => ({ kind: 'text' as const, text: `• ${text}` })),
  ];
  for (const block of lesson.content.blocks) {
    if (block.type === 'code') {
      blocks.push(
        { kind: 'heading', text: `Code · ${block.language}` },
        { kind: 'code', text: block.code },
      );
    } else if (block.type === 'callout')
      blocks.push({ kind: 'heading', text: block.title }, { kind: 'text', text: block.text });
    else blocks.push({ kind: block.type === 'heading' ? 'heading' : 'text', text: block.text });
  }
  blocks.push({ kind: 'heading', text: 'Resources' });
  for (const resource of lesson.resources)
    blocks.push({
      kind: 'text',
      text: `${resource.title}\n${resource.url ?? 'Reading suggestion — search by title; link not verified.'}`,
      ...(resource.url ? { href: resource.url } : {}),
    });
  blocks.push({ kind: 'heading', text: 'Videos' });
  if (videos.length)
    for (const video of videos)
      blocks.push({
        kind: 'text',
        text: `${video.title}\n${video.channel}\nhttps://www.youtube.com/watch?v=${video.id}`,
        href: `https://www.youtube.com/watch?v=${video.id}`,
      });
  else
    blocks.push({
      kind: 'text',
      text: `No video selected. Suggested searches:\n${(lesson.content.videoQueries ?? [lesson.title]).join('\n')}`,
    });
  blocks.push({ kind: 'heading', text: 'Knowledge check · questions and answers' });
  lesson.content.quiz.forEach((question, index) => {
    blocks.push({ kind: 'heading', text: `${index + 1}. ${question.question}` });
    question.options.forEach((option, choice) =>
      blocks.push({ kind: 'text', text: `${String.fromCharCode(65 + choice)}. ${option}` }),
    );
    blocks.push({
      kind: 'text',
      text: `Answer: ${String.fromCharCode(65 + question.correctAnswerIndex)}. ${question.options[question.correctAnswerIndex]}\nExplanation: ${question.explanation}`,
    });
  });
  return blocks.map((block, index) => ({ ...block, id: `block-${index}` }));
}

const STYLE = `
.lesson-print-page{box-sizing:border-box;width:${WIDTH}px;height:${HEIGHT}px;padding:${MARGIN}px;background:#fff;color:#172923;font:16px/1.6 Arial,sans-serif;position:relative;overflow:hidden;}
.lesson-print-label{height:28px;font:11px Arial,sans-serif;letter-spacing:2px;color:#436b59;}
.lesson-print-body{height:${BODY_HEIGHT}px;display:flow-root;}
.lesson-print-block{margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;box-sizing:border-box;}
.lesson-print-title{font:bold 30px/1.25 Arial,sans-serif;margin-bottom:18px;}
.lesson-print-heading{font:bold 19px/1.4 Arial,sans-serif;margin:12px 0 10px;}
.lesson-print-code{font:13px/1.6 Consolas,'Courier New',monospace;background:#edf3ee;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-all;border:1px solid #d5dfd8;}
.lesson-print-footer{position:absolute;bottom:25px;left:${MARGIN}px;right:${MARGIN}px;font:11px Arial,sans-serif;border-top:1px solid #d5dfd8;padding-top:8px;display:flex;justify-content:space-between;}
`;
function blockElement(block: ExportBlock, text: string) {
  const element = document.createElement('div');
  element.className = `lesson-print-block lesson-print-${block.kind}`;
  element.textContent = text;
  return element;
}

export async function createLessonPdf(
  lesson: Lesson,
  videos: Video[] = [],
  onProgress?: (page: number, total: number) => void,
) {
  const [html2canvas, { jsPDF }] = await Promise.all([
    import('html2canvas').then((module) => module.default),
    import('jspdf'),
  ]);
  await document.fonts.ready;
  const blocks = lessonExportBlocks(lesson, videos);
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-12000px;top:0;pointer-events:none;z-index:-1;';
  const style = document.createElement('style');
  style.textContent = STYLE;
  host.append(style);
  document.body.append(host);
  const manifest: ExportManifest = {
    blocks,
    pages: [],
    pageWidth: WIDTH,
    pageHeight: HEIGHT,
    bodyHeight: BODY_HEIGHT,
  };
  const pages: HTMLElement[] = [];
  let body: HTMLElement, current: ExportManifest['pages'][number];
  const newPage = () => {
    if (pages.length >= 120) throw new Error('This lesson exceeds the 120-page export limit.');
    const page = document.createElement('section');
    page.className = 'lesson-print-page';
    const label = document.createElement('div');
    label.className = 'lesson-print-label';
    label.textContent = 'TEXT TO LEARN · LESSON NOTES';
    body = document.createElement('div');
    body.className = 'lesson-print-body';
    page.append(label, body);
    host.append(page);
    pages.push(page);
    current = { number: pages.length, fragments: [] };
    manifest.pages.push(current);
  };
  const height = (element: HTMLElement) =>
    element.getBoundingClientRect().height +
    parseFloat(getComputedStyle(element).marginTop) +
    parseFloat(getComputedStyle(element).marginBottom);
  const used = () =>
    Array.from(body.children).reduce((total, child) => total + height(child as HTMLElement), 0);
  const measure = (block: ExportBlock, text: string) => {
    const element = blockElement(block, text);
    body.append(element);
    const measured = height(element);
    element.remove();
    return measured;
  };
  const append = (block: ExportBlock, start: number, end: number) => {
    const text = block.text.slice(start, end),
      element = blockElement(block, text);
    body.append(element);
    const bounds = element.getBoundingClientRect(),
      container = body.getBoundingClientRect();
    const fragment = {
      blockId: block.id,
      start,
      end,
      text,
      top: bounds.top - container.top,
      bottom: bounds.bottom - container.top,
    };
    if (fragment.bottom > BODY_HEIGHT + 0.5 || fragment.top < -0.5)
      throw new Error('The lesson could not be laid out without clipping.');
    current.fragments.push(fragment);
  };
  try {
    newPage();
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index]!,
        fullHeight = measure(block, block.text);
      // Keep ordinary blocks intact. Keep short headings with the next block's first lines.
      const reserve =
        block.kind === 'heading' && blocks[index + 1]
          ? Math.min(85, measure(blocks[index + 1]!, blocks[index + 1]!.text))
          : 0;
      if (used() && fullHeight <= BODY_HEIGHT && fullHeight + reserve > BODY_HEIGHT - used())
        newPage();
      let start = 0;
      while (start < block.text.length) {
        let remaining = BODY_HEIGHT - used();
        if (remaining < 65 && used()) {
          newPage();
          remaining = BODY_HEIGHT;
        }
        const rest = block.text.slice(start);
        if (measure(block, rest) <= remaining) {
          append(block, start, block.text.length);
          break;
        }
        // A block taller than a page is split as text before capture, at word/code-line boundaries.
        let low = 0,
          high = rest.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (measure(block, rest.slice(0, mid)) <= remaining) low = mid;
          else high = mid - 1;
        }
        if (!low) {
          if (used()) {
            newPage();
            continue;
          }
          throw new Error('A lesson block could not fit on a page.');
        }
        let length = low;
        const candidate = rest.slice(0, length);
        const boundary =
          block.kind === 'code'
            ? candidate.lastIndexOf('\n')
            : Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'));
        if (boundary >= length * 0.65) length = boundary + 1;
        // Never split a Unicode surrogate pair. All characters, including whitespace, are retained.
        if (/[\uD800-\uDBFF]/.test(rest[length - 1] ?? '')) length--;
        append(block, start, start + length);
        start += length;
        newPage();
      }
    }
    for (const [index, page] of pages.entries()) {
      const footer = document.createElement('div');
      footer.className = 'lesson-print-footer';
      const title = document.createElement('span');
      title.textContent = lesson.title.slice(0, 70);
      const counter = document.createElement('span');
      counter.textContent = `${index + 1} / ${pages.length}`;
      footer.append(title, counter);
      page.append(footer);
    }
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({
      title: lesson.title,
      subject: 'Full lesson, resources and MCQ answers',
      creator: 'Text to Learn',
    });
    for (const [index, page] of pages.entries()) {
      onProgress?.(index + 1, pages.length);
      const canvas = await html2canvas(page, {
        scale: 1.5,
        backgroundColor: '#ffffff',
        logging: false,
        width: WIDTH,
        height: HEIGHT,
        windowWidth: WIDTH,
        windowHeight: HEIGHT,
        useCORS: false,
      });
      if (index) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 210, 297);
      for (const fragment of manifest.pages[index]!.fragments) {
        const href = blocks.find((block) => block.id === fragment.blockId)?.href;
        if (href)
          pdf.link(
            (MARGIN / WIDTH) * 210,
            ((MARGIN + 28 + fragment.top) / HEIGHT) * 297,
            ((WIDTH - MARGIN * 2) / WIDTH) * 210,
            ((fragment.bottom - fragment.top) / HEIGHT) * 297,
            { url: href },
          );
      }
      canvas.width = canvas.height = 0;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return { blob: pdf.output('blob'), manifest };
  } finally {
    host.remove();
  }
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
