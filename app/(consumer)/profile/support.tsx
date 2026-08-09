import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Icon } from '@/components/ui/Icon';
import { showToast } from '@/components/ui/Toast';

interface FAQ {
  question: string;
  answer: string;
}

const FAQS: FAQ[] = [
  {
    question: 'How does Smart Split work?',
    answer:
      "If no single account can cover a payment, Lenz Pay automatically splits it across your connected sources — NGN accounts first, then USD, then crypto — so the payment still goes through.",
  },
  {
    question: 'Is my money safe?',
    answer:
      'Your PIN is stored using hardware-backed secure storage on your device, never on our servers in plain text. Biometric confirmation adds a second layer for every payment.',
  },
  {
    question: 'What happens if a payment fails?',
    answer:
      "No funds move on a failed attempt. You'll see the reason and can retry with the same or a different source immediately.",
  },
  {
    question: 'How do I earn cashback and points?',
    answer: 'Every completed payment earns points and cashback automatically, at a rate that depends on the merchant category and your rewards tier.',
  },
];

function FAQItem({ faq }: { faq: FAQ }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.faqCard} activeOpacity={0.85}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{faq.question}</Text>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.primary} />
      </View>
      {expanded ? <Text style={styles.faqAnswer}>{faq.answer}</Text> : null}
    </TouchableOpacity>
  );
}

export default function SupportScreen() {
  const handleEmail = () => {
    Linking.openURL('mailto:support@lenzpay.app').catch(() => showToast('error', "Couldn't open email app"));
  };

  const handleChat = () => {
    showToast('info', 'Live chat', 'Chat support is coming soon — email us in the meantime.');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Help & Support" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.contactRow}>
          <TouchableOpacity onPress={handleChat} style={styles.contactCard}>
            <View style={styles.contactIconWrap}>
              <Icon name="chatbubble-ellipses" size={22} color={Colors.primary} />
            </View>
            <Text style={styles.contactLabel}>Live Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEmail} style={styles.contactCard}>
            <View style={styles.contactIconWrap}>
              <Icon name="mail" size={22} color={Colors.primary} />
            </View>
            <Text style={styles.contactLabel}>Email Us</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Frequently Asked Questions" />
          {FAQS.map((faq) => (
            <FAQItem key={faq.question} faq={faq} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: Spacing.xxxl,
  },
  contactRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  contactCard: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.xl,
  },
  contactIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  section: {
    marginTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  faqCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestion: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
    marginRight: Spacing.md,
  },
  faqAnswer: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
