import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { pendingMatches } from '../../api/pendingMatches';
import { resetMockDb } from '../../mocks/db';
import { resetMockNetworkState } from '../../mocks/handlers';
import { DEFAULT_SCENARIO, SCENARIOS, getScenario, isScenarioId, setScenario, type ScenarioId } from '../../mocks/scenarios';
import { STORAGE_KEYS, removeKey } from '../../storage/localStore';
import { loadLastResult, saveRecordOutcome } from '../../storage/preferences';

/**
 * Developer panel to pick a mocked network scenario and restore the initial
 * mock state. Works in the deployed build too (the backend is MSW).
 */
export function NetworkLab() {
  const queryClient = useQueryClient();
  const [scenario, setScenarioState] = useState<ScenarioId>(() => getScenario());
  const [message, setMessage] = useState('');
  const selectId = useId();
  const description = SCENARIOS.find((item) => item.id === scenario)?.description ?? '';

  const choose = (value: string) => {
    if (!isScenarioId(value)) return;
    setScenario(value);
    setScenarioState(value);
    resetMockNetworkState();
    queryClient.clear();
    setMessage(`Scenario set to “${SCENARIOS.find((item) => item.id === value)?.label ?? value}”.`);
  };

  const reset = () => {
    resetMockDb();
    resetMockNetworkState();
    removeKey(STORAGE_KEYS.pendingMatches);
    const last = loadLastResult();
    if (last) saveRecordOutcome(last.matchId, null);
    pendingMatches.reload();
    setScenario(DEFAULT_SCENARIO);
    setScenarioState(DEFAULT_SCENARIO);
    queryClient.clear();
    setMessage('Mock data, pending records and scenario restored to the initial state.');
  };

  return (
    <details className="network-lab">
      <summary>Network lab (mock API scenarios)</summary>
      <div className="network-lab__body">
        <label className="field__label" htmlFor={selectId}>
          Scenario
        </label>
        <select id={selectId} className="select-input" value={scenario} onChange={(event) => choose(event.target.value)}>
          {SCENARIOS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="field__hint">{description}</p>
        <button type="button" className="text-button" onClick={reset}>
          Reset mock data
        </button>
        <p className="save-status" role="status">
          {message}
        </p>
      </div>
    </details>
  );
}
