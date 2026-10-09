import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';

/** Make → model → year selector. Saves the choice as "my car" and filters the whole store. */
export default function FitmentPicker({ onDone, compact = false, submitLabel = 'Show parts for this car' }) {
  const { vehicles, garage, setGarage } = useStore();
  const [make, setMake] = useState(garage?.make || '');
  const [model, setModel] = useState(garage?.model || '');
  const [year, setYear] = useState(garage?.year ? String(garage.year) : '');

  const models = useMemo(() => vehicles.find((m) => m.make === make)?.models || [], [vehicles, make]);
  const range = models.find((m) => m.model === model);
  const years = useMemo(() => {
    if (!range) return [];
    return Array.from({ length: range.yearTo - range.yearFrom + 1 }, (_, i) => range.yearTo - i);
  }, [range]);

  useEffect(() => { if (model && !models.some((m) => m.model === model)) { setModel(''); setYear(''); } }, [models, model]);
  useEffect(() => { if (year && !years.includes(Number(year))) setYear(''); }, [years, year]);

  const submit = (e) => {
    e.preventDefault();
    if (!make || !model || !year) return;
    const v = { make, model, year: Number(year) };
    setGarage(v);
    onDone?.(v);
  };

  return (
    <form className={`picker ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <div className="picker-fields">
        <label>
          <span>Make</span>
          <select value={make} onChange={(e) => { setMake(e.target.value); setModel(''); setYear(''); }} required>
            <option value="">Select make</option>
            {vehicles.map((m) => <option key={m.make}>{m.make}</option>)}
          </select>
        </label>
        <label>
          <span>Model</span>
          <select value={model} onChange={(e) => { setModel(e.target.value); setYear(''); }} disabled={!make} required>
            <option value="">{make ? 'Select model' : 'Choose a make first'}</option>
            {models.map((m) => <option key={m.model}>{m.model}</option>)}
          </select>
        </label>
        <label>
          <span>Year</span>
          <select value={year} onChange={(e) => setYear(e.target.value)} disabled={!model} required>
            <option value="">{model ? 'Select year' : 'Choose a model first'}</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <button className="btn primary" type="submit" disabled={!make || !model || !year}>{submitLabel}</button>
    </form>
  );
}
