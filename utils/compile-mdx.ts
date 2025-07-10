import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkUnwrapImages from "remark-unwrap-images";
import remarkSmartypants from "remark-smartypants";
import remarkRehype from "remark-rehype";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode, {
  type CharsElement,
  type LineElement,
} from "rehype-pretty-code";
import { visit } from "unist-util-visit";
import matter from "gray-matter";
import type { Root, Element, Text } from "hast";

function hastToJson(node: Root | Element | Text | any): any {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type === "root") {
    return node.children.map(hastToJson).filter(Boolean);
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

// This function remains a valid transformer, we will just call it manually.
function customSerializerAndTocExtractor(options: { toc: TocEntry[] }) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(node.tagName)) {
        const id = node.properties?.id as string;
        if (!id) return;
        let text = "";
        visit(node, "text", (textNode: Text) => {
          text += textNode.value;
        });
        options.toc.push({
          level: parseInt(node.tagName.substring(1), 10),
          id,
          text,
        });
      }
    });
    return hastToJson(tree);
  };
}

export async function compileMDX(source: string) {
  const { content: mdx, data: meta } = matter(source);
  const toc: TocEntry[] = [];

  // Define the processor with all transformation plugins
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkUnwrapImages)
    .use(remarkSmartypants)
    .use(remarkRehype, { allowDangerousHtml: true })
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
      // NOTE: Added types for better safety
      onVisitLine(element: LineElement) {
        if (element.children.length === 0) {
          element.children = [{ type: "text", value: " " }];
        }
      },
      onVisitHighlightedLine(element: LineElement) {
        element.properties.className?.push("highlighted");
      },
      onVisitHighlightedChars(element: CharsElement) {
        element.properties.className = ["word"];
      },
    });

  // Manually run the pipeline: parse, then transform
  const mdast = processor.parse(mdx);
  const hast = (await processor.run(mdast)) as Root;

  // Now, manually call your custom function on the final tree
  const transformer = customSerializerAndTocExtractor({ toc });
  const contentJson = transformer(hast);

  return {
    content: JSON.stringify(contentJson),
    toc: JSON.stringify(toc),
    meta,
  };
}