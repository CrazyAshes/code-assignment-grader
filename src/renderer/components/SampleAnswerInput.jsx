function SampleAnswerInput({ value, onChange, disabled = false }) {
  return (
    <div className="field">
      <label htmlFor="sampleAnswer">Sample answer (optional)</label>
      <textarea
        id="sampleAnswer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="Paste a reference solution here. This is only for understanding the task and should NOT be treated as the only correct implementation."
        rows={6}
      />
    </div>
  );
}

export default SampleAnswerInput;
