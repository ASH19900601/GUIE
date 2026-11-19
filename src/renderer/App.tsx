import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { WelcomeHome } from './components/WelcomeHome';
import { AppShell } from './components/AppShell';
import { StoryWorkbench } from './components/story/StoryWorkbench';
import { AsrWorkbenchModal } from './components/story/AsrWorkbenchModal';
import { CharactersPage } from './components/CharactersPage';
import { AssetsPage } from './components/AssetsPage';
import { AppearancePage } from './components/AppearancePage';
import { ExtensionsPage } from './components/ExtensionsPage';
import { ReuseLibraryPage } from './components/ReuseLibraryPage';
import { LocalizationPage } from './components/LocalizationPage';
import { FinishWizardPage } from './components/FinishWizardPage';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { SnapshotsModal } from './components/SnapshotsModal';
import { AdvancedModeView } from './components/AdvancedModeView';

export const App: React.FC = () => {
  const { project, mode, activeTab, initApp } = useAppStore();

  useEffect(() => {
    void initApp();
  }, [initApp]);

  if (!project) {
    return <WelcomeHome />;
  }

  return (
    <AppShell>
      {mode === 'advanced' ? (
        <AdvancedModeView />
      ) : (
        <>
          {activeTab === 'story' && <StoryWorkbench />}
          {activeTab === 'characters' && <CharactersPage />}
          {activeTab === 'assets' && <AssetsPage />}
          {activeTab === 'appearance' && <AppearancePage />}
          {activeTab === 'extensions' && <ExtensionsPage />}
          {activeTab === 'reuse' && <ReuseLibraryPage />}
          {activeTab === 'localization' && <LocalizationPage />}
          {activeTab === 'finish' && <FinishWizardPage />}
        </>
      )}

      <AiAssistantDrawer />
      <SnapshotsModal />
      <AsrWorkbenchModal />
    </AppShell>
  );
};
