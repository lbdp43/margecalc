/**
 * Legacy `Input` — now a thin alias of `TextField` that keeps the old API
 * (label, error, suffix, every TextInput prop, `style` → TextInput) and the
 * old 16 px bottom margin so not-yet-redesigned forms keep their spacing.
 * New code: use `TextField` from components/ui.
 */
import React, { forwardRef } from 'react';
import { TextInput } from 'react-native';
import { TextField, TextFieldProps } from './TextField';

export interface InputProps extends TextFieldProps {
  label: string;
  error?: string;
  suffix?: string;
}

export const Input = React.memo(
  forwardRef<TextInput, InputProps>(function Input({ containerStyle, ...props }, ref) {
    return <TextField ref={ref} containerStyle={[{ marginBottom: 16 }, containerStyle]} {...props} />;
  }),
);
