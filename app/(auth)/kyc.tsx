import { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Modal, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { showToast } from '@/components/ui/Toast';
import { submitKYC, type KYCSubmission } from '@/services/kyc';

const ID_TYPES: { key: KYCSubmission['idType']; label: string }[] = [
  { key: 'NIN', label: 'NIN' },
  { key: 'Passport', label: 'Passport' },
  { key: 'DriversLicense', label: "Driver's License" },
];

interface CaptureCardProps {
  label: string;
  uri: string | null;
  onCapture: () => void;
}

function CaptureCard({ label, uri, onCapture }: CaptureCardProps) {
  return (
    <TouchableOpacity onPress={onCapture} style={styles.captureCard} activeOpacity={0.8}>
      {uri ? (
        <Image source={{ uri }} style={styles.captureThumb} />
      ) : (
        <View style={styles.capturePlaceholder}>
          <Text style={styles.captureIcon}>📷</Text>
        </View>
      )}
      <View style={styles.captureInfo}>
        <Text style={styles.captureLabel}>{label}</Text>
        <Text style={styles.captureHint}>{uri ? 'Tap to retake' : 'Tap to capture'}</Text>
      </View>
      {uri ? <Text style={styles.captureCheck}>✓</Text> : null}
    </TouchableOpacity>
  );
}

export default function KYCScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [bvn, setBvn] = useState('');
  const [idType, setIdType] = useState<KYCSubmission['idType']>('NIN');
  const [idPhotoUri, setIdPhotoUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [activeCapture, setActiveCapture] = useState<'id' | 'selfie' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = bvn.length === 11 && !!idPhotoUri && !!selfieUri;

  const openCapture = async (target: 'id' | 'selfie') => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showToast('error', 'Camera access needed', 'Enable camera permission to verify your identity.');
        return;
      }
    }
    setActiveCapture(target);
  };

  const handleTakePhoto = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
    if (!photo) return;
    if (activeCapture === 'id') setIdPhotoUri(photo.uri);
    else if (activeCapture === 'selfie') setSelfieUri(photo.uri);
    setActiveCapture(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !idPhotoUri || !selfieUri) return;
    setSubmitting(true);
    await submitKYC({ bvn, idType, idPhotoUri, selfiePhotoUri: selfieUri });
    setSubmitting(false);
    router.replace('/(auth)/kyc-pending');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Verify your identity" subtitle="Required for payments over ₦50,000" />

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>BVN</Text>
        <TextInput
          value={bvn}
          onChangeText={(t) => setBvn(t.replace(/[^0-9]/g, '').slice(0, 11))}
          placeholder="11-digit BVN"
          placeholderTextColor={Colors.onSurfaceMuted}
          keyboardType="number-pad"
          style={styles.input}
          accessibilityLabel="BVN"
        />

        <Text style={[styles.label, styles.spacedLabel]}>ID type</Text>
        <View style={styles.chipRow}>
          {ID_TYPES.map((t) => (
            <Chip key={t.key} label={t.label} selected={idType === t.key} onPress={() => setIdType(t.key)} />
          ))}
        </View>

        <View style={styles.spacedLabel}>
          <CaptureCard label="ID photo" uri={idPhotoUri} onCapture={() => openCapture('id')} />
        </View>
        <CaptureCard label="Selfie" uri={selfieUri} onCapture={() => openCapture('selfie')} />

        <Button
          label="Submit for Review"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!canSubmit}
          style={styles.submit}
        />
      </ScrollView>

      <Modal visible={activeCapture !== null} animationType="slide">
        <View style={styles.cameraWrap}>
          {permission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={activeCapture === 'selfie' ? 'front' : 'back'}
            />
          ) : null}
          <View style={styles.cameraControls}>
            <TouchableOpacity onPress={() => setActiveCapture(null)} style={styles.cameraCancel}>
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
  spacedLabel: {
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  captureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
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
  captureIcon: { fontSize: 22 },
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
  captureCheck: {
    color: Colors.success,
    fontSize: 18,
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
