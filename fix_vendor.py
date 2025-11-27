from pathlib import Path
p=Path('app/modals/vendor-account.tsx')
lines=p.read_text(encoding='utf-8').splitlines()
# find second import block start index
second_import=lines.index('import {')
# rebuild imports
new_header = """import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from 'react-native';
""".split('\n')
rest = lines[second_import+1:]
new_lines = new_header + rest
p.write_text('\n'.join(new_lines), encoding='utf-8')
print('rewrote header')
