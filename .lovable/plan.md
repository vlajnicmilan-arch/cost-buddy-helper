

## Plan: Fix PIN Save Issue

### Problem
User enters PIN and confirms it, but it doesn't persist — after closing the dialog, Settings still shows "Postavi PIN" instead of the toggle switch.

### Root Cause Analysis
The `handleDigit` function auto-submits when PIN reaches 4 or 6 digits inside a `setTimeout(150ms)`. The `step` state captured in the closure may be stale due to React's batching, causing the confirm step to misidentify the current phase. Additionally, `lightTap()` is async but not awaited — if it throws before the try/catch wraps it, it could silently break the flow.

### Fix (1 file)

**`src/components/SetPinDialog.tsx`**
- Use a `useRef` for `step` and `firstPin` to avoid stale closure issues inside `setTimeout`
- Add try/catch around the entire save flow (`setPin` + `enableLock`) to surface any hidden errors
- Add a `toast.error` fallback if save fails
- Ensure `lightTap()` doesn't block digit handling (already fire-and-forget, but add safety)

### Changes

```tsx
// Use refs to avoid stale closures in setTimeout
const stepRef = useRef(step);
const firstPinRef = useRef(firstPin);

// Keep refs in sync
useEffect(() => { stepRef.current = step; }, [step]);
useEffect(() => { firstPinRef.current = firstPin; }, [firstPin]);

const handleDigit = (digit: string) => {
  if (currentPin.length >= 6) return;
  lightTap(); // fire-and-forget
  const newPin = currentPin + digit;
  setCurrentPin(newPin);
  setError(false);

  if (newPin.length === 4 || newPin.length === 6) {
    setTimeout(async () => {
      if (stepRef.current === 'enter') {
        setFirstPin(newPin);
        setCurrentPin('');
        setStep('confirm');
      } else {
        if (newPin === firstPinRef.current) {
          try {
            await setPin(newPin);
            enableLock(true);
            successVibration();
            emitAvatarEvent('proud', 'Zaštićeno! 🛡️');
            toast.success(t('lock.pinSet', 'PIN je postavljen'));
            resetAndClose();
          } catch (err) {
            console.error('Failed to save PIN:', err);
            toast.error('Greška pri spremanju PIN-a');
          }
        } else if (newPin.length === firstPinRef.current.length) {
          setError(true);
          errorVibration();
          setTimeout(() => setCurrentPin(''), 600);
        }
      }
    }, 150);
  }
};
```

This ensures the `step` and `firstPin` values read inside the `setTimeout` are always current, not stale from a previous render closure.

