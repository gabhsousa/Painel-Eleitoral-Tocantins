import type { Row } from '../../shared/types';
import { num, pct } from '../../shared/lib/format';
export function Metrics({ data }: { data: Row }) {
  return (
    <div className="metrics">
      {[
        ['Eleitores aptos', num(data.aptos)],
        ['Comparecimento', num(data.comparecimento)],
        ['Abstenções', num(data.abstencoes)],
        ['Taxa de abstenção', pct(data.percentual_abstencao)],
      ].map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
