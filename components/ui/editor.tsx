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
  CodeToggle, InsertImage, InsertTable
 } from "@mdxeditor/editor";

import { FC } from "react";
import '@mdxeditor/editor/style.css';


interface EditorProps {
  markdown: string;
  editorRef?: React.MutableRefObject<MDXEditorMethods | null>;
  onChange?: (markdown: string) => void;
  imageUploadHandler?: (image: File) => Promise<string>;
}

/**
 * Extend this Component further with the necessary plugins or props you need.
 * proxying the ref is necessary. Next.js dynamically imported components don't support refs.
 */
const Editor: FC<EditorProps> = ({ markdown, editorRef, onChange, imageUploadHandler }) => {
  async function handleImageUpload(image: File) {
    if (imageUploadHandler) {
      return imageUploadHandler(image)
    }
    return Promise.resolve('https://picsum.photos/200/300')
  }

  return (
    <MDXEditor
      className='prose prose-invert min-w-full'
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
            </>
          )
        })
      ]}
    />
  );
};

export default Editor;