import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const recipeMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-semibold text-base-content mb-4 leading-tight">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-semibold text-coffee mt-7 mb-3 border-b border-base-200 pb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-base-content mt-5 mb-2">{children}</h3>,
  p: ({ children }) => <p className="text-sm leading-7 text-base-content/80 mb-3">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-base-content">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 text-sm leading-7 text-base-content/80 mb-4">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-2 text-sm leading-7 text-base-content/80 mb-4">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-base-200 mb-5">
      <table className="table table-zebra table-sm w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-base-200/70 text-base-content">{children}</thead>,
  th: ({ children }) => <th className="font-semibold text-base-content whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="align-top text-base-content/80">{children}</td>,
  hr: () => <div className="divider my-6" />,
};

interface RecipeMarkdownProps {
  markdown: string;
}

export default function RecipeMarkdown({ markdown }: RecipeMarkdownProps) {
  return (
    <div className="recipe-markdown max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={recipeMarkdownComponents}>
        {stripRecipeFrontmatter(markdown)}
      </ReactMarkdown>
    </div>
  );
}

function stripRecipeFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
}
