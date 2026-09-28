import { Link } from 'react-router-dom';

export interface MetadataPill {
  label: string;
  to: string;
}

export function MetadataPills({ pills }: { pills: MetadataPill[] }) {
  if (pills.length === 0) return null;

  return (
    <div className="metadata-pills" aria-label="Metadata filters">
      {pills.map((pill) => (
        <Link
          key={`${pill.label}-${pill.to}`}
          to={pill.to}
          className="metadata-pill"
        >
          {pill.label}
        </Link>
      ))}
    </div>
  );
}
