import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

test('renders learn react link', () => {
  const { getByText } = render(<App bridge={{
    encrypt: () => Promise.resolve().then(() => new Uint8Array()),
    decrypt: () => Promise.resolve().then(() => new Uint8Array()),
  }}/>);
  const linkElement = getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
