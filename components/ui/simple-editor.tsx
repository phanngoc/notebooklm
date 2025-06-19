"use client";

import React from "react";
import MDEditor from '@uiw/react-md-editor';
import 'katex/dist/katex.css';
import katex from 'katex';
import { getCodeString } from 'rehype-rewrite';
import { FC, useEffect, useRef, useState, Fragment, useCallback } from "react";
import mermaid from "mermaid";

interface EditorProps {
  markdown: string;
  onChange?: (markdown: string) => void;
  imageUploadHandler?: (image: File) => Promise<string>;
}

const randomid = () => parseInt(String(Math.random() * 1e15), 10).toString(36);
const Code = ({ inline, children = [], className, ...props }) => {
  const demoid = useRef(`dome${randomid()}`);
  const [container, setContainer] = useState(null);
  const isMermaid =
    className && /^language-mermaid/.test(className.toLocaleLowerCase());
  const code = children
    ? getCodeString(props.node.children)
    : children[0] || "";

  useEffect(() => {
    if (container && isMermaid && demoid.current && code) {
      mermaid
        .render(demoid.current, code)
        .then(({ svg, bindFunctions }) => {
          container.innerHTML = svg;
          if (bindFunctions) {
            bindFunctions(container);
          }
        })
        .catch((error) => {
          console.log("error:", error);
        });
    }
  }, [container, isMermaid, code, demoid]);

  const refElement = useCallback((node) => {
    if (node !== null) {
      setContainer(node);
    }
  }, []);

  if (isMermaid) {
    return (
      <Fragment>
        <code id={demoid.current} style={{ display: "none" }} />
        <code className={className} ref={refElement} data-name="mermaid" />
      </Fragment>
    );
  }

  if (typeof children === 'string' && /^\$\$(.*)\$\$/.test(children)) {
    const html = katex.renderToString(children.replace(/^\$\$(.*)\$\$/, '$1'), {
      throwOnError: false,
    });
    return <code dangerouslySetInnerHTML={{ __html: html }} style={{ background: 'transparent' }} />;
  }
  const codeMath = props.node && props.node.children ? getCodeString(props.node.children) : children;
  if (
    typeof codeMath === 'string' &&
    typeof className === 'string' &&
    /^language-katex/.test(className.toLocaleLowerCase())
  ) {
    const html = katex.renderToString(codeMath, {
      throwOnError: false,
    });
    return <code style={{ fontSize: '150%' }} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return <code className={className}>{children}</code>;
};

/**
 * Extend this Component further with the necessary plugins or props you need.
 * proxying the ref is necessary. Next.js dynamically imported components don't support refs.
 */
const Editor: FC<EditorProps> = ({ markdown, onChange, imageUploadHandler }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dynamicHeight, setDynamicHeight] = useState<string>('');
  let isFirstRender = useRef(true);
  useEffect(() => {
    const calculateHeight = () => {
      console.log('Calculating dynamic height...', containerRef.current, isFirstRender.current);
      if (containerRef.current && isFirstRender.current === true) {
        const containerHeight = containerRef.current.offsetHeight;
        // Trừ đi khoảng cách padding/margin nếu cần
        const adjustedHeight = Math.max(containerHeight - 70, 300); // Min height 300px
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
          preview="edit"
          height={dynamicHeight}
          previewOptions={{
            components: {
              code: Code,
            },
          }}
      />
    </div>
  );
};

export default Editor;