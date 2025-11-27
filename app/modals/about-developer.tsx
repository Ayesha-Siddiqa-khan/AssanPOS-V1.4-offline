import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function AboutDeveloperModal() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>About the Developer</Text>
            <Text style={styles.subtitle}>Thank you for using AsaanPOS</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Ionicons name="close" size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>MA</Text>
        </View>
        <Text style={styles.name}>Muhammad AbuBakar Siddique</Text>
        <Text style={styles.role}>Web & Mobile App Developer</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>I can help you build:</Text>
          <View style={styles.row}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#2563eb" />
            <Text style={styles.sectionItem}>Custom websites</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#2563eb" />
            <Text style={styles.sectionItem}>Android & iOS apps</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#2563eb" />
            <Text style={styles.sectionItem}>AI-powered tools and dashboards</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Need help? Reach out:</Text>
          <View style={styles.row}>
            <Ionicons name="mail-outline" size={18} color="#2563eb" />
            <Text style={styles.contact}>abubakarkhanlakhwera@gmail.com</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="call-outline" size={18} color="#2563eb" />
            <Text style={styles.contact}>03066987888</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6fa',
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#64748b',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2563eb',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  role: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionItem: {
    fontSize: 14,
    color: '#334155',
  },
  contact: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
});
