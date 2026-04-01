import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://xjscuzizvxawfapmhdct.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqc2N1eml6dnhhd2ZhcG1oZGN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODY1MDksImV4cCI6MjA5MDE2MjUwOX0.MzpYCE5ROSdMALHZMVYDJ0zBnk3lZbBG5Xwh2_HW1o0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
