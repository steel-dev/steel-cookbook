import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkUnwrapImages from "remark-unwrap-images";
import remarkSmartypants from "remark-smartypants";
import remarkRehype from "remark-rehype";
import rehypeExternalLinks from "rehype-external-links";
import remarkStringify from "remark-stringify";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode, {
  type CharsElement,
  type LineElement,
} from "rehype-pretty-code";
import { visit } from "unist-util-visit";
import matter from "gray-matter";
import type { Root, Element, Text } from "hast";

type Target = "json" | "markdown";

interface JsonResult {
  content: string;          // hast-to-json string
  toc: string;              // toc JSON string
  meta: Record<string, unknown>;
}

interface MarkdownResult {
  markdown: string;
  meta: Record<string, unknown>;
}

const OMIT = new Set([
  "id",
  "accentColor",
  "category",
  "stack",
  "clients",
  "nextSteps",
]);

const frontMatterToBanner = (data: any) => () => (tree: any) => {
  if (!data) return;

  const nodes: any[] = [];

  if (data.title) {
    nodes.push({
      type: "heading",
      depth: 1,
      children: [{ type: "text", value: String(data.title) }],
    });
  }

  if (data.description) {
    nodes.push({
      type: "paragraph",
      children: [{ type: "text", value: String(data.description) }],
    });
  }

  /* prepend so the banner is at the very top */
  tree.children.unshift(...nodes);
};

const mdxRewrites = () => (tree: any) => {
  // first unwrap all Guide blocks
  visit(tree, "mdxJsxFlowElement", (n: any, i: number | undefined, p: any) => {
    if (typeof i !== "number" || !p) return;
    if (n.name === "Guide") {
      p.children.splice(i, 1, ...n.children);
    }
  });

  // now handle all other custom blocks
  visit(tree, "mdxJsxFlowElement", (n: any, i: number | undefined, p: any) => {
    if (typeof i !== "number" || !p) return;

    const swap = (...nodes: any[]) => p.children.splice(i, 1, ...nodes);

    switch (n.name) {
      case "Step": {
        const title = n.attributes?.find((a: any) => a.name === "title")?.value ?? "";
        swap({ type: "heading", depth: 2, children: [{ type: "text", value: title }] }, ...n.children);
        break;
      }

      case "Intro": {
        const href =
          n.attributes?.find((a: any) => a.name === "skipLink")?.value ?? "#full-code-example";
        swap({
          type: "paragraph",
          children: [
            {
              type: "link",
              url: href,
              children: [{ type: "text", value: "Skip to full example" }],
            },
          ],
        });
        break;
      }

      case "FullCodeExample": {
        const title = n.attributes?.find((a: any) => a.name === "title")?.value ?? "Full Example";
        swap(
          { type: "html", value: `<a id="full-code-example"></a>` },
          { type: "heading", depth: 2, children: [{ type: "text", value: title }] },
          ...n.children,
        );
        break;
      }
    }
  });

  visit(tree, "mdxJsxTextElement", (n: any, i: number | undefined, p: any) => {
    if (typeof i !== "number" || !p) return;
    if (n.name === "HighlightRef") {
      p.children[i] = { type: "strong", children: n.children };
    }
  });

  visit(tree, "code", (n: any) => {
    n.meta = null;
  });
};


function hastToJson(node: Root | Element | Text | any): any {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type === "root") {
    return node.children.map(hastToJson).filter(Boolean);
  }

  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const props: Record<string, any> = {};
    for (const attr of node.attributes || []) {
      if (attr.type === "mdxJsxAttribute") {
        // THE FIX IS HERE:
        // Correctly handle different attribute value types.
        let propValue;
        if (attr.value === null) {
          // Handles boolean props like <Component disabled />
          propValue = true;
        } else if (
          typeof attr.value === "object" &&
          attr.value.type === "mdxJsxAttributeValueExpression"
        ) {
          // Handles JSX expressions like number={1} or enabled={true}
          // We use JSON.parse as a safe way to evaluate the expression string.
          try {
            propValue = JSON.parse(attr.value.value);
          } catch {
            propValue = attr.value.value; // Fallback for non-JSON values
          }
        } else {
          // Handles simple string attributes like title="My Title"
          propValue = attr.value;
        }
        props[attr.name] = propValue;
      }
    }
    if (node.children && node.children.length > 0) {
      props.children = node.children.map(hastToJson).filter(Boolean);
    }
    return ["$r", node.name, props.key || null, props];
  }

  const tagName = node.name || node.tagName;
  if (!tagName) {
    return null;
  }
  const props: Record<string, any> = node.properties || {};
  if (node.data) {
    Object.assign(props, node.data);
  }
  if (node.children && node.children.length > 0) {
    props.children = node.children.map(hastToJson).filter(Boolean);
  }
  return ["$r", tagName, props.key || null, props];
}

interface TocEntry {
  level: number;
  id: string;
  text: string;
}

export async function compileMDX(source: string): Promise<JsonResult>;
export async function compileMDX(source: string, target: "json"): Promise<JsonResult>;
export async function compileMDX(source: string, target: "markdown"): Promise<MarkdownResult>;

export async function compileMDX(
  source: string,
  target: Target = "json",
): Promise<JsonResult | MarkdownResult> {
  const { content, data: meta } = matter(source);

  if (target === "markdown") {
    const md = await unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkFrontmatter)
      .use(remarkGfm)
      .use(remarkSmartypants)
      .use(frontMatterToBanner(meta))
      .use(mdxRewrites)
      .use(remarkStringify, { fences: true })
      .process(content);

    return { markdown: String(md), meta };
  }

  const toc: TocEntry[] = [];

  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkUnwrapImages)
    .use(remarkSmartypants)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      passThrough: ["mdxJsxFlowElement", "mdxJsxTextElement"],
    })
    .use(rehypeSlug)
    .use(rehypeExternalLinks, {
      target: "_blank",
      rel: ["noopener", "noreferrer"],
    })
    .use(rehypePrettyCode, {
      theme: {
        dark: "aurora-x",
        light: "github-light",
      },
      // onVisitLine(element: LineElement) {
      //   if (element.children.length === 0) {
      //     element.children = [{ type: "text", value: " " }];
      //   }
      // },
      // onVisitHighlightedLine(element: LineElement) {
      //   element.properties.className?.push("highlighted");
      // },
      // onVisitHighlightedChars(element: CharsElement) {
      //   element.properties.className = ["word"];
      // },
      onVisitHighlightedLine(element: LineElement) {
        // This correctly uses push() and is safe.
        element.properties.className?.push("highlighted");
      },
      // THE FIX IS HERE:
      onVisitHighlightedChars(element: CharsElement, id) {
        // Ensure the className array exists before we push to it.
        if (!element.properties.className) {
          element.properties.className = [];
        }
        // Safely ADD our class instead of overwriting.
        element.properties.className.push("word");

        // This part for IDs is correct.
        if (id) {
          element.properties["data-chars-id"] = id;
        }
      },
    })
    // .use(rehypeApplyColorVars);

  const mdast = processor.parse(content);
  const hast = (await processor.run(mdast)) as Root;

  visit(hast, "element", (node: Element) => {
    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(node.tagName)) {
      const id = node.properties?.id as string;
      if (!id) return;
      let text = "";
      visit(node, "text", (textNode: Text) => {
        text += textNode.value;
      });
      toc.push({
        level: parseInt(node.tagName.substring(1), 10),
        id,
        text,
      });
    }
  });

  const contentJson = hastToJson(hast);

  return {
    content: JSON.stringify(contentJson),
    toc: JSON.stringify(toc),
    meta,
  };
}