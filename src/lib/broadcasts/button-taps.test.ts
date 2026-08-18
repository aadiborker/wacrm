import { describe, expect, it } from 'vitest';
import {
  recipientMatchesTappedButton,
  summarizeBroadcastButtonTaps,
} from '@/lib/broadcasts/button-taps';

describe('summarizeBroadcastButtonTaps', () => {
  it('groups unique contacts by button payload', () => {
    expect(
      summarizeBroadcastButtonTaps([
        { tapped_button: 'YES_INTERESTED' },
        { tapped_button: 'YES_INTERESTED' },
        { tapped_button: 'Call me back' },
        { tapped_button: null },
        { tapped_button: '  ' },
      ]),
    ).toEqual([
      { button: 'YES_INTERESTED', count: 2 },
      { button: 'Call me back', count: 1 },
    ]);
  });
});

describe('recipientMatchesTappedButton', () => {
  it('matches the stored payload', () => {
    expect(
      recipientMatchesTappedButton(
        { tapped_button: 'YES_INTERESTED' },
        'YES_INTERESTED',
      ),
    ).toBe(true);
    expect(
      recipientMatchesTappedButton({ tapped_button: 'other' }, 'YES_INTERESTED'),
    ).toBe(false);
  });
});
