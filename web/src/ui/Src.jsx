import { repoFile } from './site.js';

/** A citation: the stored file (or write-up section) a quoted number was read from, linked to the repository. */
export default function Src({ path, children, section }) {
  const paths = Array.isArray(path) ? path : [path];
  return (
    <span className="src">
      {children ? <>{children} </> : null}
      {paths.map((p, i) => (
        <span key={p}>
          {i > 0 ? ', ' : ''}
          <a href={repoFile(p)} rel="noopener noreferrer" target="_blank">{p.replace(/^results\//, i > 0 ? '' : 'results/')}</a>
        </span>
      ))}
      {section ? <> ({section})</> : null}
    </span>
  );
}
