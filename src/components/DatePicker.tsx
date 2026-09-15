import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface DatePickerProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  placeholder: string;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Local (not UTC) YYYY-MM-DD, as required by <input type="date">'s value attribute.
function toInputDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Cross-platform date picker: Android shows native dialog; iOS uses a bottom modal with Done/Cancel. */
export default function DatePicker({ label, value, onChange, placeholder }: DatePickerProps) {
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value ?? new Date());

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
      if (event.type === 'set' && selected) {
        onChange(selected);
      }
    } else {
      // iOS — keep picker open until Done is pressed
      if (selected) setTempDate(selected);
    }
  };

  const handleIOSDone = () => {
    setShow(false);
    onChange(tempDate);
  };

  const handleIOSCancel = () => {
    setShow(false);
    setTempDate(value ?? new Date());
  };

  const handleWebChange = (event: any) => {
    const raw: string = event.target.value;
    if (!raw) return;
    const [year, month, day] = raw.split('-').map(Number);
    onChange(new Date(year, month - 1, day));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {Platform.OS === 'web' ? (
        React.createElement('input', {
          type: 'date',
          value: value ? toInputDateString(value) : '',
          placeholder,
          onChange: handleWebChange,
          style: webInputStyle,
        })
      ) : (
        <TouchableOpacity style={styles.button} onPress={() => setShow(true)}>
          <Text style={[styles.buttonText, !value && styles.placeholder]}>
            {value ? formatDate(value) : placeholder}
          </Text>
          <Text style={styles.icon}>📅</Text>
        </TouchableOpacity>
      )}

      {/* Android: inline picker */}
      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleChange}
        />
      )}

      {/* iOS: modal picker with Done/Cancel */}
      {Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" visible={show}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={handleIOSCancel}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{label}</Text>
                <TouchableOpacity onPress={handleIOSDone}>
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleChange}
                style={styles.iosPicker}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// Plain CSS (not a RN ViewStyle) for the raw DOM <input> rendered on web.
const webInputStyle: Record<string, string | number> = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 12,
  fontSize: 16,
  color: '#333',
  backgroundColor: '#fafafa',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  button: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fafafa',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    color: '#333',
  },
  placeholder: {
    color: '#aaa',
  },
  icon: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalCancel: {
    fontSize: 16,
    color: '#FF3B30',
  },
  modalDone: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  iosPicker: {
    height: 200,
  },
});
