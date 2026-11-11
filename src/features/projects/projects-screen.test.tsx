import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { listProjects, type ProjectSummary } from './projects-repo';
import { ProjectsScreen } from './projects-screen';

jest.mock('./projects-repo', () => ({
  listProjects: jest.fn(),
  createProject: jest.fn(),
  getProject: jest.fn(),
  addTakeWithClip: jest.fn(),
  deleteProject: jest.fn(),
}));

const mockedListProjects = jest.mocked(listProjects);

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const QueryProvider = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ProjectsScreen />, { wrapper: QueryProvider });
}

const idea = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
  id: 'p1',
  name: 'Idea 1',
  createdAt: 0,
  updatedAt: 0,
  duration: 0,
  ...overrides,
});

describe('ProjectsScreen', () => {
  it('offers to record a new idea and explains the empty list', async () => {
    mockedListProjects.mockResolvedValue([]);
    await renderScreen();

    expect(screen.getByRole('button', { name: 'Record new idea' })).toBeOnTheScreen();
    expect(await screen.findByText(/Your ideas show up here/)).toBeOnTheScreen();
  });

  it('lists saved ideas with their length', async () => {
    mockedListProjects.mockResolvedValue([
      idea({ id: 'a', name: 'Chorus riff', duration: 83 }),
      idea({ id: 'b', name: 'Idea 2', duration: 5.4 }),
    ]);
    await renderScreen();

    expect(await screen.findByText('Chorus riff')).toBeOnTheScreen();
    expect(screen.getByText('1:23')).toBeOnTheScreen();
    expect(screen.getByText('Idea 2')).toBeOnTheScreen();
    expect(screen.getByText('0:05')).toBeOnTheScreen();
  });
});
