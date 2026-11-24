import { Suspense, lazy, useCallback, useState } from 'react';
import { sound } from '../audio/sound';
import { navigate, useRoute } from './router';
import { MenuButton } from './components/Buttons';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Panel } from './components/Panel';
import { MenuScreen } from './screens/MenuScreen';
import { OptionsScreen } from './screens/OptionsScreen';
import { ResultScreen } from './screens/ResultScreen';
import { CaptainsLog } from './screens/log/CaptainsLog';
import { assetUrl } from '../assetUrl';

// PixiJS is only needed in combat: load it on demand to keep menus light.
const GameScreen = lazy(() => import('./screens/game/GameScreen').then((module) => ({ default: module.GameScreen })));

/**
 * Shown when the battle screen fails to load or render. Browsers cache a
 * failed dynamic import for the page's lifetime, so recovery is a reload
 * (which lands on the menu: a battle is never resumed after a refresh).
 */
function GameCrashed() {
  return (
    <main className="screen">
      <Panel title="The battle could not open" titleId="game-crash-title">
        <p className="notice notice--error" role="alert">
          Something went wrong while loading the battle. Check your connection and try again.
        </p>
        <MenuButton onClick={() => window.location.reload()}>Reload Game</MenuButton>
      </Panel>
    </main>
  );
}

function GameFallback() {
  return (
    <main className="game" aria-busy="true">
      <p className="visually-hidden" role="status">
        Preparing the battle…
      </p>
    </main>
  );
}

export function App() {
  const route = useRoute();
  // Each Play starts a fresh match: the key remounts GameScreen.
  const [matchNumber, setMatchNumber] = useState(0);

  const play = useCallback(() => {
    sound.unlock();
    setMatchNumber((value) => value + 1);
    navigate('play');
  }, []);

  switch (route) {
    case 'play':
      return (
        <ErrorBoundary key={matchNumber} fallback={<GameCrashed />}>
          <Suspense fallback={<GameFallback />}>
            <GameScreen />
          </Suspense>
        </ErrorBoundary>
      );
    case 'options':
      return <OptionsScreen />;
    case 'result':
      return <ResultScreen onPlayAgain={play} />;
    case 'ranking':
    case 'history':
      return <CaptainsLog key={route} tab={route} />;
    default:
      return (
        <>
          <MenuScreen onPlay={play} />
          <img className="brand-logo" src={assetUrl('logo_jungle_gaming.svg')} alt="" width={120} height={40} />
        </>
      );
  }
}
