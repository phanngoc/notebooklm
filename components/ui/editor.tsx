"use client";

import { MDXEditor, headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  imagePlugin,
  tablePlugin,
  type MDXEditorMethods,
  type MDXEditorProps,
  toolbarPlugin,
  UndoRedo, BoldItalicUnderlineToggles, BlockTypeSelect,
  CodeToggle, InsertImage, InsertTable, InsertCodeBlock,
  SandpackConfig,
  sandpackPlugin,
  codeBlockPlugin,
  codeMirrorPlugin
 } from "@mdxeditor/editor";

import { FC, useEffect, useRef, useState } from "react";
import '@mdxeditor/editor/style.css';


interface EditorProps {
  markdown: string;
  editorRef?: React.MutableRefObject<MDXEditorMethods | null>;
  onChange?: (markdown: string) => void;
  imageUploadHandler?: (image: File) => Promise<string>;
}

const simpleSandpackConfig: SandpackConfig = {
  defaultPreset: 'react',
  presets: [
    {
      label: 'React',
      name: 'react',
      meta: 'live react',
      sandpackTemplate: 'react',
      sandpackTheme: 'light',
      snippetFileName: '/App.js',
      snippetLanguage: 'jsx',
    }
  ]
}

/**
 * Extend this Component further with the necessary plugins or props you need.
 * proxying the ref is necessary. Next.js dynamically imported components don't support refs.
 */
const Editor: FC<EditorProps> = ({ markdown, editorRef, onChange, imageUploadHandler }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dynamicHeight, setDynamicHeight] = useState<string>('650px');
  let isFirstRender = useRef(true);
  useEffect(() => {
    const calculateHeight = () => {
      console.log('Calculating dynamic height...', containerRef.current, isFirstRender.current);
      if (containerRef.current && isFirstRender.current === true) {
        const containerHeight = containerRef.current.offsetHeight;
        console.log('Container height:', containerHeight);
        // Trừ đi khoảng cách padding/margin nếu cần
        const adjustedHeight = Math.max(containerHeight, 300); // Min height 300px
        console.log('Adjusted height:', adjustedHeight);
        setDynamicHeight(`${adjustedHeight}px`);

        isFirstRender.current = false;
      }
    };

    // Tính toán height ban đầu
    calculateHeight();

    // Lắng nghe resize window
    const handleResize = () => {
      calculateHeight();
    };

    window.addEventListener('resize', handleResize);

    // Tính toán lại khi parent container thay đổi
    const resizeObserver = new ResizeObserver(() => {
      calculateHeight();
    });

    if (containerRef.current?.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  async function handleImageUpload(image: File) {
    if (imageUploadHandler) {
      return imageUploadHandler(image)
    }
    return Promise.resolve('https://picsum.photos/200/300')
  }

  return (
    <div ref={containerRef} className={`w-full h-full overflow-y-auto`} style={{ height: dynamicHeight }}>
      {!isFirstRender.current && (
        <MDXEditor
          className={`prose prose-invert min-w-full`}
          contentEditableClassName="prose"
          onChange={(e) => onChange && onChange(e)}
          ref={editorRef}
          markdown={markdown}
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            markdownShortcutPlugin(),
            tablePlugin(),
            codeBlockPlugin({ defaultCodeBlockLanguage: 'js' }),
            sandpackPlugin({ sandpackConfig: simpleSandpackConfig }),
            codeMirrorPlugin({ codeBlockLanguages: { js: 'JavaScript', css: 'CSS', python: 'Python' } }),
            imagePlugin({
              imageUploadHandler: handleImageUpload,
            }),
            toolbarPlugin({
              toolbarClassName: 'my-classname',
              toolbarContents: () => (
                <>
                  <UndoRedo />
                  <BoldItalicUnderlineToggles />
                  <BlockTypeSelect />
                  <CodeToggle />
                  <InsertImage />
                  <InsertTable />
                  <InsertCodeBlock />
                </>
              )
            })
          ]}
        />
      )}
    </div>
  );
};

export default Editor;