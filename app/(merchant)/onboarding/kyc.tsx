import { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Image, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { showToast } from '@/components/ui/Toast';

export default function MerchantKYCScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [cacNumber, setCacNumber] = useState('');
  const [bvn, setBvn] = useState('');
  const [docUri, setDocUri] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = cacNumber.length >= 7 && bvn.length === 11 && !!docUri;

  const openCapture = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showToast('error', 'Camera access needed');
        return;
      }
    }
    setCapturing(true);
  };

  const handleTakePhoto = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
    if (photo) setDocUri(photo.uri);
    setCapturing(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    setSubmitting(false);
    router.push('/(merchant)/onboarding/settlement-setup');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Verify Your Business" subtitle="Step 2 of 4" />

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>CAC registration number</Text>
        <TextInput
          value={cacNumber}
          onChangeText={setCacNumber}
          placeholder="RC1234567"
          placeholderTextColor={Colors.onSurfaceMuted}
          style={styles.input}
          autoCapitalize="characters"
        />

        <Text style={[styles.label, styles.spaced]}>BVN</Text>
        <TextInput
          value={bvn}
          onChangeText={(t) => setBvn(t.replace(/[^0-9]/g, '').slice(0, 11))}
          placeholder="11-digit BVN"
          placeholderTextColor={Colors.onSurfaceMuted}
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={[styles.label, styles.spaced]}>CAC certificate</Text>
        <TouchableOpacity onPress={openCapture} style={styles.captureCard} activeOpacity={0.8}>
          {docUri ? (
            <Image source={{ uri: docUri }} style={styles.captureThumb} />
          ) : (
            <View style={styles.capturePlaceholder}>
              <Icon name="document-text-outline" size={24} color={Colors.onSurfaceVariant} />
            </View>
          )}
          <View style={styles.captureInfo}>
            <Text style={styles.captureLabel}>Certificate photo</Text>
            <Text style={styles.captureHint}>{docUri ? 'Tap to retake' : 'Tap to capture'}</Text>
          </View>
          {docUri ? <Icon name="checkmark-circle" size={20} color={Colors.success} /> : null}
        </TouchableOpacity>

        <Button label="Continue" trailingArrow onPress={handleSubmit} loading={submitting} disabled={!canSubmit} style={styles.submit} />
      </ScrollView>

      <Modal visible={capturing} animationType="slide">
        <View style={styles.cameraWrap}>
          {permission?.granted ? <CameraView ref={cameraRef} style={styles.camera} facing="back" /> : null}
          <View style={styles.cameraControls}>
            <TouchableOpacity onPress={() => setCapturing(false)} style={styles.cameraCancel}>
              <Text style={styles.cameraCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleTakePhoto} style={styles.shutter} accessibilityLabel="Take photo" />
            <View style={styles.cameraCancel} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  form: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.sm,
  },
  spaced: {
    marginTop: Spacing.lg,
  },
  input: {
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  captureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  captureThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
  },
  capturePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInfo: { flex: 1 },
  captureLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onSurface,
  },
  captureHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  submit: {
    marginTop: Spacing.xl,
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    position: 'absolute',
    bottom: Spacing.xxl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
  },
  cameraCancel: {
    width: 64,
  },
  cameraCancelText: {
    fontFamily: 'Inter_500Medium',
    color: '#fff',
    fontSize: 14,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
});
