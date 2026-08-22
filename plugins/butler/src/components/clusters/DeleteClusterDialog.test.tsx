// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeleteClusterDialog } from './DeleteClusterDialog';

function renderDialog(onConfirm: () => Promise<void>, onClose = jest.fn()) {
  render(
    <DeleteClusterDialog
      open
      onClose={onClose}
      onConfirm={onConfirm}
      clusterName="e2e-talos"
      clusterNamespace="platform-engineering"
      workerCount={2}
    />,
  );
  return { onClose };
}

describe('DeleteClusterDialog', () => {
  it('keeps the destructive button disabled until the name matches', () => {
    renderDialog(jest.fn().mockResolvedValue(undefined));
    expect(
      screen.getByRole('dialog', { name: 'Delete Cluster' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 worker nodes will be terminated'),
    ).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Delete Cluster' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('e2e-talos'), {
      target: { value: 'e2e-tal' },
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('e2e-talos'), {
      target: { value: 'e2e-talos' },
    });
    expect(confirm).toBeEnabled();
  });

  it('submits on Enter once confirmed and closes on success', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const { onClose } = renderDialog(onConfirm);
    const input = screen.getByPlaceholderText('e2e-talos');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'e2e-talos' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows the failure inline and stays open', async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error('webhook denied'));
    const { onClose } = renderDialog(onConfirm);
    fireEvent.change(screen.getByPlaceholderText('e2e-talos'), {
      target: { value: 'e2e-talos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Cluster' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'webhook denied',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Delete Cluster' }),
    ).toBeEnabled();
  });
});
