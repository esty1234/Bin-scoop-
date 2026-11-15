import { MII_DEFINITIONS } from '../lib/iso7812.ts';

const NETWORK_ALLOCATIONS = [
  {
    network: 'Visa',
    ranges: '400000 – 499999',
    lengths: '13, 16, 19',
    luhn: 'Required',
  },
  {
    network: 'Mastercard',
    ranges: '510000 – 559999, 222100 – 272099',
    lengths: '16',
    luhn: 'Required',
  },
  {
    network: 'American Express',
    ranges: '340000 – 349999, 370000 – 379999',
    lengths: '15',
    luhn: 'Required',
  },
  {
    network: 'Discover',
    ranges: '601100 – 601199, 644000 – 649999, 650000 – 659999',
    lengths: '16, 19',
    luhn: 'Required',
  },
  {
    network: 'JCB',
    ranges: '352800 – 358999',
    lengths: '16 – 19',
    luhn: 'Required',
  },
  {
    network: 'UnionPay',
    ranges: '620000 – 629999, 810000 – 819999',
    lengths: '16 – 19',
    luhn: 'Optional (varies)',
  },
  {
    network: 'Diners Club International',
    ranges: '300000 – 305999, 309500 – 309599, 36, 38 – 39',
    lengths: '14, 16, 19',
    luhn: 'Required',
  },
];

export default function IsoReferenceView() {
  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
          ISO/IEC 7812 Standard Reference
        </h1>
        <p className="text-sm text-slate-600 mt-1.5 max-w-3xl leading-relaxed">
          ISO/IEC 7812 defines the numbering structure for Issuer Identification Numbers (IIN),
          commonly known as Bank Identification Numbers (BIN). In April 2022, payment networks
          expanded the standard BIN length from 6 digits to 8 digits to accommodate issuer growth
          while preserving PCI-DSS truncation rules on the remaining account digits.
        </p>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Major Industry Identifier (MII) — Leading Digit 1
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-6 w-20">Digit</th>
                <th className="py-2.5 px-6">Industry Category</th>
                <th className="py-2.5 px-6">Allocation Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MII_DEFINITIONS.map((item) => (
                <tr key={item.digit} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-6 font-mono text-xs font-semibold text-blue-800 tabular-nums">
                    {item.digit}
                  </td>
                  <td className="py-2.5 px-6 text-xs font-medium text-slate-900">
                    {item.category}
                  </td>
                  <td className="py-2.5 px-6 text-xs text-slate-600">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Primary Payment Network Prefix Ranges
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-6">Network</th>
                <th className="py-2.5 px-6">Prefix Range</th>
                <th className="py-2.5 px-6 text-right">PAN Length</th>
                <th className="py-2.5 px-6 text-right">Luhn Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {NETWORK_ALLOCATIONS.map((row) => (
                <tr key={row.network} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-6 text-xs font-medium text-slate-900">
                    {row.network}
                  </td>
                  <td className="py-2.5 px-6 font-mono text-xs text-slate-700 tabular-nums">
                    {row.ranges}
                  </td>
                  <td className="py-2.5 px-6 font-mono text-xs text-slate-700 text-right tabular-nums">
                    {row.lengths}
                  </td>
                  <td className="py-2.5 px-6 text-xs text-slate-700 text-right">{row.luhn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
