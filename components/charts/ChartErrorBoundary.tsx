import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

interface ChartErrorBoundaryProps {
  children: React.ReactNode;
  height?: number;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
}

/**
 * Skia-based charts (SpendBarChart, RevenueChart) need CanvasKit's WASM
 * runtime loaded via `WithSkiaWeb` to render on web — native iOS/Android
 * doesn't need this (Skia initializes natively there). Without it, a chart
 * mounted before CanvasKit is ready throws. This boundary keeps that failure
 * scoped to the chart instead of taking down the whole screen.
 */
export class ChartErrorBoundary extends React.Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  state: ChartErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) {
      console.warn('[ChartErrorBoundary] chart failed to render:', error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={[styles.fallback, { height: this.props.height ?? 160 }]}>
          <Text style={styles.text}>Chart unavailable right now</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
  },
  text: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceMuted,
  },
});
