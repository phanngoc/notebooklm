"use client";

import { MDXEditor, headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  type MDXEditorMethods,
  type MDXEditorProps,
  toolbarPlugin
 } from "@mdxeditor/editor";

import { FC } from "react";
import '@mdxeditor/editor/style.css';


interface EditorProps {
  markdown: string;
  editorRef?: React.MutableRefObject<MDXEditorMethods | null>;
  onChange?: (markdown: string) => void;
}

/**
 * Extend this Component further with the necessary plugins or props you need.
 * proxying the ref is necessary. Next.js dynamically imported components don't support refs.
 */
const Editor: FC<EditorProps> = ({ markdown, editorRef, onChange }) => {
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
      ]}
    />
  );
};

export default Editor;