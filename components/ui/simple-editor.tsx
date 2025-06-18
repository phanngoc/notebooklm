"use client";

import React from "react";
import MDEditor from '@uiw/react-md-editor';
import 'katex/dist/katex.css';
import katex from 'katex';
import { getCodeString } from 'rehype-rewrite';
import { FC, useEffect, useRef, useState } from "react";

interface EditorProps {
  markdown: string;
  onChange?: (markdown: string) => void;
  imageUploadHandler?: (image: File) => Promise<string>;
}


/**
 * Extend this Component further with the necessary plugins or props you need.
 * proxying the ref is necessary. Next.js dynamically imported components don't support refs.
 */
const Editor: FC<EditorProps> = ({ markdown, onChange, imageUploadHandler }) => {
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
      <MDEditor
          value={markdown}
          onChange={(e) => onChange && onChange(e)}
          height={dynamicHeight}
          previewOptions={{
            components: {
          code: ({ children = [], className, ...props }) => {
            if (typeof children === 'string' && /^\$\$(.*)\$\$/.test(children)) {
              const html = katex.renderToString(children.replace(/^\$\$(.*)\$\$/, '$1'), {
                throwOnError: false,
              });
              return <code dangerouslySetInnerHTML={{ __html: html }} style={{ background: 'transparent' }} />;
            }
            const code = props.node && props.node.children ? getCodeString(props.node.children) : children;
            if (
              typeof code === 'string' &&
              typeof className === 'string' &&
              /^language-katex/.test(className.toLocaleLowerCase())
            ) {
              const html = katex.renderToString(code, {
                throwOnError: false,
              });
              return <code style={{ fontSize: '150%' }} dangerouslySetInnerHTML={{ __html: html }} />;
            }
            return <code className={String(className)}>{children}</code>;
          },
        },

          }}
      />
    </div>
  );
};

export default Editor;