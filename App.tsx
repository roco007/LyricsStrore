import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  StatusBar,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
  Dimensions,
  BackHandler,
  Platform,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { Paths, Directory, File } from 'expo-file-system';
import { copyAsync, makeDirectoryAsync, getInfoAsync, deleteAsync } from 'expo-file-system/legacy';

interface Lyrics {
  id: string;
  title: string;
  content: string;
  audioUri?: string;
  audioFileName?: string;
  localPath?: string;
  genre: string;
  scale: string;
  createdAt: string;
}

type ViewType = 'list' | 'editor' | 'viewer' | 'genre' | 'settings';
type ThemeType = 'light' | 'dark' | 'system';

interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
  shadow: string;
  headerBackground: string;
  searchBackground: string;
  inputBackground: string;
  cardBackground: string;
  buttonBackground: string;
  buttonText: string;
  accent: string;
}

const { width } = Dimensions.get('window');

// Theme color definitions
const lightTheme: ThemeColors = {
  background: '#ffffff',
  surface: '#f8f9fa',
  primary: '#8b5cf6',
  text: '#000000',
  textSecondary: '#666666',
  border: '#e0e0e0',
  shadow: '#000000',
  headerBackground: '#ffffff',
  searchBackground: '#ffffff',
  inputBackground: '#f8f9fa',
  cardBackground: '#ffffff',
  buttonBackground: '#8b5cf6',
  buttonText: '#ffffff',
  accent: '#8b5cf6',
};

const darkTheme: ThemeColors = {
  background: '#1a1a1a',
  surface: '#2a2a2a',
  primary: '#8b5cf6',
  text: '#ffffff',
  textSecondary: '#a0a0a0',
  border: '#4a4a4a',
  shadow: '#000000',
  headerBackground: '#2a2a2a',
  searchBackground: '#1a1a1a',
  inputBackground: '#3a3a3a',
  cardBackground: '#2a2a2a',
  buttonBackground: '#8b5cf6',
  buttonText: '#ffffff',
  accent: '#8b5cf6',
};

const App = (): React.JSX.Element => {
  const [currentView, setCurrentView] = useState<ViewType>('list');
  const [previousView, setPreviousView] = useState<ViewType | null>(null);
  const [allLyrics, setAllLyrics] = useState<Lyrics[]>([]);
  const [currentLyrics, setCurrentLyrics] = useState<Lyrics | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [theme, setTheme] = useState<ThemeType>('light');
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [showScaleDropdown, setShowScaleDropdown] = useState(false);
  const [filteredGenres, setFilteredGenres] = useState<string[]>([]);
  const [filteredScales, setFilteredScales] = useState<string[]>([]);

  // Get current theme colors based on selected theme
  const getCurrentTheme = (): ThemeColors => {
    if (theme === 'system') {
      // For now, default to light theme for system
      // In a real app, you'd detect the system theme here
      return lightTheme;
    }
    return theme === 'dark' ? darkTheme : lightTheme;
  };

  const currentTheme = getCurrentTheme();
  // Editor state (hoisted to avoid using Hooks in conditional render)
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorAudioUri, setEditorAudioUri] = useState('');
  const [editorAudioFileName, setEditorAudioFileName] = useState('');
  const [editorLocalPath, setEditorLocalPath] = useState('');
  const [editorGenre, setEditorGenre] = useState('');
  const [editorScale, setEditorScale] = useState('');
  // Progress bar widths for seeking
  const [editorProgressWidth, setEditorProgressWidth] = useState(0);
  const [viewerProgressWidth, setViewerProgressWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [wasPlayingBeforeDrag, setWasPlayingBeforeDrag] = useState(false);

  useEffect(() => {
    loadLyrics();
    
    // Hide system UI for fullscreen experience
    if (Platform.OS === 'android') {
      StatusBar.setHidden(true, 'fade');
    }
    
    // Listen for app state changes to maintain hidden status bar
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active' && Platform.OS === 'android') {
        StatusBar.setHidden(true, 'fade');
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      cleanupAudio();
      subscription?.remove();
    };
  }, []);

  // Handle back button press
  useEffect(() => {
    const backAction = () => {
      switch (currentView) {
        case 'list':
          // On main list view, show exit confirmation
          Alert.alert(
            'Exit App',
            'Are you sure you want to exit?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
            ]
          );
          return true; // Prevent default behavior
        case 'editor':
        case 'viewer':
          // Navigate back contextually (to genre if came from genre, otherwise to list)
          navigateBack();
          return true; // Prevent default behavior
        case 'genre':
          // Navigate back to main list
          navigateToList();
          return true; // Prevent default behavior
        default:
          return false; // Allow default behavior
      }
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [currentView, previousView]);

  const loadLyrics = async () => {
    try {
      const storedLyrics = await AsyncStorage.getItem('myLyrics');
      const parsedLyrics = storedLyrics ? JSON.parse(storedLyrics) : [];
      
      // Add default songs if no lyrics exist
      if (parsedLyrics.length === 0) {
        const defaultSongs: Lyrics[] = [
          {
            id: 'default-reference-song',
            title: 'Welcome to LyricsStore! 🎵',
            content: `Welcome to your personal lyrics collection!

This is a sample song that you can edit but not delete. It serves as a reference to show you how your lyrics will look.

Features:
• Add your own songs with the "+ New" button
• Search through your collection
• Organize by genres
• Edit any song by tapping on it
• This reference song stays as a guide

Start building your music library today! 🎶`,
            genre: 'Reference',
            scale: 'C',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'default-sample-song',
            title: 'Sample Song - Imagine 🎤',
            content: `Imagine there's no heaven
It's easy if you try
No hell below us
Above us only sky

Imagine all the people
Living for today
Imagine there's no countries
It isn't hard to do
Nothing to kill or die for
And no religion too

Imagine all the people
Living life in peace

You may say I'm a dreamer
But I'm not the only one
I hope some day you'll join us
And the world will be as one

[This is a sample song to show you how lyrics look in the app]`,
            genre: 'Pop',
            scale: 'C Major',
            createdAt: new Date().toISOString(),
          }
        ];
        
        parsedLyrics.push(...defaultSongs);
        await AsyncStorage.setItem('myLyrics', JSON.stringify(parsedLyrics));
      }
      
      setAllLyrics(parsedLyrics);
    } catch (error) {
      console.error('Error loading lyrics:', error);
    }
  };

  // Helper function to delete audio file
  const deleteAudioFile = async (localPath: string) => {
    try {
      if (localPath) {
        await deleteAsync(localPath);
        console.log('Audio file deleted:', localPath);
      }
    } catch (error) {
      // File might not exist, that's okay
      console.log('File deletion failed (might not exist):', error);
    }
  };

  const saveLyrics = async (lyrics: Lyrics) => {
    try {
      let updatedLyrics;
      if (editMode) {
        // Find the existing lyrics to check for old audio file
        const existingLyrics = allLyrics.find(l => l.id === lyrics.id);
        
        // If there's an old audio file and it's different from the new one, delete the old file
        if (existingLyrics?.localPath && existingLyrics.localPath !== lyrics.localPath) {
          await deleteAudioFile(existingLyrics.localPath);
        }
        
        updatedLyrics = allLyrics.map(l => l.id === lyrics.id ? lyrics : l);
      } else {
        updatedLyrics = [...allLyrics, lyrics];
      }
      setAllLyrics(updatedLyrics);
      await AsyncStorage.setItem('myLyrics', JSON.stringify(updatedLyrics));
      navigateToList();
    } catch (error) {
      console.error('Error saving lyrics:', error);
      Alert.alert('Error', 'Failed to save lyrics');
    }
  };

  const deleteLyrics = async (id: string) => {
    try {
      // Prevent deletion of the default songs
      if (id === 'default-reference-song' || id === 'default-sample-song') {
        Alert.alert(
          'Cannot Delete Default Song',
          'This is a default song that helps you understand how the app works. You can edit it but not delete it.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Find the lyrics to delete and remove associated audio file
      const lyricsToDelete = allLyrics.find(l => l.id === id);
      if (lyricsToDelete?.localPath) {
        await deleteAudioFile(lyricsToDelete.localPath);
      }
      
      const updatedLyrics = allLyrics.filter(l => l.id !== id);
      setAllLyrics(updatedLyrics);
      await AsyncStorage.setItem('myLyrics', JSON.stringify(updatedLyrics));
    } catch (error) {
      console.error('Error deleting lyrics:', error);
    }
  };

  const navigateToEditor = (lyrics?: Lyrics) => {
    setPreviousView(currentView);
    if (lyrics) {
      setCurrentLyrics(lyrics);
      setEditMode(true);
      setEditorTitle(lyrics.title || '');
      setEditorContent(lyrics.content || '');
      setEditorAudioUri(lyrics.audioUri || '');
      setEditorAudioFileName(lyrics.audioFileName || '');
      setEditorLocalPath(lyrics.localPath || '');
      setEditorGenre(lyrics.genre || '');
      setEditorScale(lyrics.scale || '');
    } else {
      setCurrentLyrics({
        id: Date.now().toString(),
        title: '',
        content: '',
        genre: 'General',
        scale: 'C',
        createdAt: new Date().toISOString(),
      });
      setEditMode(false);
      setEditorTitle('');
      setEditorContent('');
      setEditorAudioUri('');
      setEditorAudioFileName('');
      setEditorLocalPath('');
      setEditorGenre('General');
      setEditorScale('C');
    }
    setCurrentView('editor');
  };

  const navigateToViewer = (lyrics: Lyrics) => {
    setPreviousView(currentView);
    setCurrentLyrics(lyrics);
    setPosition(0);
    setIsPlaying(false);
    setCurrentView('viewer');
  };

  const navigateToList = () => {
    setCurrentView('list');
    setPreviousView(null);
    setCurrentLyrics(null);
    setEditMode(false);
    setSelectedGenre('');
    // Clean up audio
    cleanupAudio();
  };

  const cleanupAudio = async () => {
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        setPosition(0);
        setDuration(0);
      }
    } catch (error) {
      console.error('Error cleaning up audio:', error);
    }
  };

  const navigateBack = () => {
    if (currentView === 'viewer' && originalView === 'genre') {
      // If we're in viewer and originally came from genre, go back to genre
      setCurrentView('genre');
      setOriginalView(null); // Clear original view after using it
    } else if (currentView === 'viewer' && previousView === 'genre') {
      // If we're in viewer and came from genre view, go back to that specific genre
      setCurrentView('genre');
    } else if (currentView === 'viewer' && previousView === 'list') {
      // If we're in viewer and came from list, go back to list
      navigateToList();
    } else if (currentView === 'editor' && previousView === 'viewer') {
      // If we're in editor and came from viewer, go back to viewer
      setCurrentView('viewer');
    } else if (currentView === 'editor' && previousView === 'list') {
      // If we're in editor and came from list, go back to list
      navigateToList();
    } else if (currentView === 'editor' && previousView === 'genre') {
      // If we're in editor and came from genre, go back to genre
      setCurrentView('genre');
    } else {
      // Default fallback - go to main list
      navigateToList();
    }
  };

  const navigateToGenre = (genre: string) => {
    setPreviousView(currentView);
    setSelectedGenre(genre);
    setCurrentView('genre');
  };

  const navigateToSettings = () => {
    setPreviousView(currentView);
    setCurrentView('settings');
  };

  const getGenres = () => {
    const genres = [...new Set(allLyrics.map(l => l.genre).filter(genre => genre && typeof genre === 'string' && genre.trim().length > 0))];
    return genres.sort();
  };

  // Filter genres based on input
  const filterGenres = (input: string) => {
    if (!input.trim()) {
      setFilteredGenres(getGenres());
      return;
    }
    
    const filtered = getGenres().filter(genre =>
      genre.toLowerCase().includes(input.toLowerCase())
    );
    setFilteredGenres(filtered);
  };

  // Handle genre input change
  const handleGenreInputChange = (text: string) => {
    setEditorGenre(text);
    filterGenres(text);
    setShowGenreDropdown(true);
  };

  // Select a genre from dropdown
  const selectGenre = (genre: string) => {
    setEditorGenre(genre);
    setShowGenreDropdown(false);
    setFilteredGenres([]);
  };

  // Create new genre
  const createNewGenre = () => {
    if (editorGenre.trim()) {
      setShowGenreDropdown(false);
      setFilteredGenres([]);
    }
  };

  // Get available musical keys
  const getScales = () => {
    const keys = [
      'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
      'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 
      'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
      'General', 'Other'
    ];
    return keys.sort();
  };

  // Filter scales based on input
  const filterScales = (input: string) => {
    if (!input.trim()) {
      setFilteredScales(getScales());
      return;
    }
    
    const filtered = getScales().filter(scale =>
      scale.toLowerCase().includes(input.toLowerCase())
    );
    setFilteredScales(filtered);
  };

  // Handle scale input change
  const handleScaleInputChange = (text: string) => {
    setEditorScale(text);
    filterScales(text);
    setShowScaleDropdown(true);
  };

  // Select a scale from dropdown
  const selectScale = (scale: string) => {
    setEditorScale(scale);
    setShowScaleDropdown(false);
    setFilteredScales([]);
  };

  // Create new scale
  const createNewScale = () => {
    if (editorScale.trim()) {
      setShowScaleDropdown(false);
      setFilteredScales([]);
    }
  };

  const getGenreColor = (genre: string) => {
    const colors = [
      '#ff6b6b', // Red
      '#4ecdc4', // Teal
      '#45b7d1', // Blue
      '#96ceb4', // Green
      '#feca57', // Yellow
      '#ff9ff3', // Pink
      '#54a0ff', // Light Blue
      '#5f27cd', // Purple
      '#00d2d3', // Cyan
      '#ff9f43', // Orange
    ];
    if (!genre || typeof genre !== 'string' || genre.length === 0) {
      return colors[0]; // Default to first color if genre is invalid
    }
    const index = genre.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getGenreIcon = (genre: string) => {
    const icons = {
      'rock': '🎸',
      'pop': '🎤',
      'hip hop': '🎧',
      'jazz': '🎷',
      'country': '🤠',
      'electronic': '🎛️',
      'classical': '🎼',
      'r&b': '🎵',
      'blues': '🎶',
      'folk': '🪕',
      'garba': '💃',
      'bollywood': '🎬',
      'bhangra': '💃',
      'sufi': '🎵',
      'ghazal': '🎵',
      'qawwali': '🎵',
      'reference': '📚',
      'general': '🎵',
      'other': '🎵',
      'rap': '🎤',
      'reggae': '🌴',
      'metal': '🤘',
      'punk': '⚡',
      'indie': '🎨',
      'alternative': '🎭',
      'funk': '🕺',
      'soul': '💫',
      'gospel': '⛪',
      'ambient': '🌌',
      'techno': '🔊',
      'house': '🏠',
      'trance': '🌀',
      'dubstep': '💥',
      'trap': '🕳️',
      'lo-fi': '📻',
    };
    if (!genre || typeof genre !== 'string') {
      return '🎵'; // Default icon if genre is invalid
    }
    // Convert to lowercase and trim whitespace for case-insensitive matching
    const normalizedGenre = genre.toLowerCase().trim();
    return icons[normalizedGenre as keyof typeof icons] || '🎵';
  };

  const getLyricsByGenre = (genre: string) => {
    return allLyrics.filter(l => l.genre === genre);
  };

  const filteredLyrics = searchTerm
    ? allLyrics.filter(l =>
        (l.title && l.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.content && l.content.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.genre && l.genre.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : selectedGenre
    ? getLyricsByGenre(selectedGenre)
    : allLyrics;

  // Search results that include both lyrics and genres
  const getSearchResults = () => {
    if (!searchTerm) return { lyrics: [], genres: [] };
    
    const matchingLyrics = allLyrics.filter(l =>
      (l.title && l.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.content && l.content.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.genre && l.genre.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    const matchingGenres = getGenres().filter(genre =>
      genre && genre.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    return { lyrics: matchingLyrics, genres: matchingGenres };
  };

  // Pick and copy audio file to project directory
  const pickAndCopyAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/wav', 'audio/ogg'],
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        
        // Create a unique filename to avoid conflicts
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop() || 'mp3';
        const uniqueFileName = `audio_${timestamp}.${fileExtension}`;
        
        // Define the music directory path
        const musicDirPath = `${Paths.document.uri}music/`;
        const destinationPath = `${musicDirPath}${uniqueFileName}`;
        
        // Ensure the music directory exists using legacy API
        try {
          await makeDirectoryAsync(musicDirPath, { intermediates: true });
          console.log('Music directory ensured');
        } catch (error) {
          console.log('Music directory creation failed:', error);
        }
        
        console.log('Copying file from:', file.uri);
        console.log('Copying file to:', destinationPath);
        
        // Copy the file to the project directory using legacy API for external URIs
        await copyAsync({
          from: file.uri,
          to: destinationPath,
        });
        
        console.log('File copied successfully');
        
        return { 
          audioUri: destinationPath, 
          audioFileName: file.name,
          localPath: destinationPath
        };
      }
    } catch (error) {
      console.error('Error picking and copying audio:', error);
      Alert.alert('Error', 'Failed to upload audio file');
    }
    return null;
  };

  const playAudio = async (audioUri: string, localPath?: string) => {
    try {
      // Use localPath if available, otherwise fall back to audioUri
      const audioSource = localPath || audioUri;
      
      // Validate audio source
      if (!audioSource || audioSource.trim() === '') {
        Alert.alert('Error', 'No audio file selected');
        return;
      }

      // If we already have a sound instance and it's paused, just resume it
      if (sound && !isPlaying) {
        await sound.playAsync();
        setIsPlaying(true);
        return;
      }

      // If we have a different sound instance, unload it first
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      // Create new sound instance
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioSource },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      
      setSound(newSound);
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio. Please check if the audio file is valid and supported.');
      setIsPlaying(false);
    }
  };

  const pauseAudio = async () => {
    try {
      if (sound) {
        await sound.pauseAsync();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('Error pausing audio:', error);
      setIsPlaying(false);
    }
  };

  const resumeAudio = async () => {
    try {
      if (sound) {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error resuming audio:', error);
      setIsPlaying(false);
    }
  };

  const stopAudio = async () => {
    try {
      if (sound) {
        await sound.stopAsync();
        setIsPlaying(false);
        setPosition(0);
      }
    } catch (error) {
      console.error('Error stopping audio:', error);
      setIsPlaying(false);
      setPosition(0);
    }
  };

  const skipBackward = async () => {
    if (!sound || !duration) return;
    const newPosition = Math.max(0, position - 10000); // 10 seconds back
    try {
      // Check if sound is loaded before trying to set position
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        await sound.setPositionAsync(newPosition);
        setPosition(newPosition);
      } else {
        console.log('Sound is not loaded yet, cannot skip backward');
      }
    } catch (error) {
      console.error('Error skipping backward:', error);
    }
  };

  const skipForward = async () => {
    if (!sound || !duration) return;
    const newPosition = Math.min(duration, position + 10000); // 10 seconds forward
    try {
      // Check if sound is loaded before trying to set position
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        await sound.setPositionAsync(newPosition);
        setPosition(newPosition);
      } else {
        console.log('Sound is not loaded yet, cannot skip forward');
      }
    } catch (error) {
      console.error('Error skipping forward:', error);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis || 0);
      setDuration(status.durationMillis || 0);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  };

  const seekToRatio = async (ratio: number) => {
    if (!sound || !duration) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    const target = Math.floor(duration * clamped);
    try {
      // Check if sound is loaded before trying to set position
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        await sound.setPositionAsync(target);
        setPosition(target);
      } else {
        console.log('Sound is not loaded yet, cannot seek');
      }
    } catch (error) {
      console.error('Error seeking audio:', error);
    }
  };

  const handleSeekByX = (x: number, width: number) => {
    if (width <= 0) return;
    void seekToRatio(x / width);
  };

  const getHandleLeft = (width: number) => {
    if (!duration || width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, position / duration));
    return ratio * width;
  };

  const formatTime = (millis: number) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = Math.floor((millis % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const renderLyricsItem = ({ item }: { item: Lyrics }) => {
    const previewText = item.content.length > 80
      ? item.content.substring(0, 80) + '...'
      : item.content;

  return (
      <TouchableOpacity
        style={[styles.lyricsItem, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}
        onPress={() => navigateToViewer(item)}
        onLongPress={() => {
          Alert.alert(
            'Delete Lyrics',
            `Are you sure you want to delete "${item.title || 'Untitled'}"?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteLyrics(item.id) },
            ]
          );
        }}
      >
        <View style={styles.lyricsItemHeader}>
          <Text style={[styles.lyricsTitle, { color: currentTheme.text }]} numberOfLines={2}>
            {item.title || 'Untitled'}
          </Text>
          {item.audioUri && <Text style={[styles.audioIndicator, { color: currentTheme.accent }]}>🎵</Text>}
        </View>
        <Text style={[styles.lyricsPreview, { color: currentTheme.textSecondary }]} numberOfLines={3}>
          {previewText}
        </Text>
        <Text style={[styles.lyricsDate, { color: currentTheme.accent }]}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSearchResultItem = ({ item, index }: { item: any, index: number }) => {
    const searchResults = getSearchResults();
    const isGenre = index < searchResults.genres.length;
    
    if (isGenre) {
      const genre = searchResults.genres[index];
      const lyricsCount = getLyricsByGenre(genre).length;
      const genreColor = getGenreColor(genre);
      const genreIcon = getGenreIcon(genre);
      
      return (
        <TouchableOpacity
          style={[styles.genreItem, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}
          onPress={() => navigateToGenre(genre)}
        >
          <View style={[styles.genreIcon, { backgroundColor: genreColor }]}>
            <Text style={styles.genreIconText}>{genreIcon}</Text>
          </View>
          <View style={styles.genreInfo}>
            <Text style={[styles.genreName, { color: currentTheme.text }]}>{genre}</Text>
            <Text style={[styles.genreCount, { color: currentTheme.textSecondary }]}>{lyricsCount} {lyricsCount === 1 ? 'song' : 'songs'}</Text>
          </View>
        </TouchableOpacity>
      );
    } else {
      const lyricsIndex = index - searchResults.genres.length;
      const lyrics = searchResults.lyrics[lyricsIndex];
      return renderLyricsItem({ item: lyrics });
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🎵</Text>
      <Text style={[styles.emptyText, { color: currentTheme.textSecondary }]}>
        {searchTerm ? 'No lyrics found matching your search.' : 'No lyrics found. Create your first lyrics!'}
      </Text>
    </View>
  );

  const renderGenreItem = ({ item }: { item: string }) => {
    const lyricsCount = getLyricsByGenre(item).length;
    const genreColor = getGenreColor(item);
    const genreIcon = getGenreIcon(item);
    
    return (
      <TouchableOpacity
        style={[styles.genreItem, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}
        onPress={() => navigateToGenre(item)}
      >
        <View style={[styles.genreIcon, { backgroundColor: genreColor }]}>
          <Text style={styles.genreIconText}>{genreIcon}</Text>
        </View>
        <View style={styles.genreInfo}>
          <Text style={[styles.genreName, { color: currentTheme.text }]}>{item}</Text>
          <Text style={[styles.genreCount, { color: currentTheme.textSecondary }]}>{lyricsCount} {lyricsCount === 1 ? 'song' : 'songs'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListView = () => {
    const header = (
      <>
        <View key="header" style={[styles.header, { backgroundColor: currentTheme.headerBackground, borderBottomColor: currentTheme.border }]}>
          <Text style={[styles.headerTitle, { color: currentTheme.text, fontSize: 20, fontWeight: '700' }]}>LyricsStore</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity style={[styles.settingsButton, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]} onPress={navigateToSettings}>
                <View style={{ width: 20, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ height: 2, width: 18, backgroundColor: currentTheme.text, borderRadius: 2, marginVertical: 1 }} />
                  <View style={{ height: 2, width: 18, backgroundColor: currentTheme.text, borderRadius: 2, marginVertical: 1 }} />
                  <View style={{ height: 2, width: 18, backgroundColor: currentTheme.text, borderRadius: 2, marginVertical: 1 }} />
                </View>
              </TouchableOpacity>
            </View>
        </View>
        <View key="search" style={[styles.searchContainer, { backgroundColor: currentTheme.searchBackground, borderBottomColor: currentTheme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              style={[
                styles.searchInput,
                { backgroundColor: currentTheme.inputBackground, borderColor: currentTheme.border, color: currentTheme.text, flex: 1 }
              ]}
              placeholder="Search Lyrics/Genres..."
              placeholderTextColor={currentTheme.textSecondary}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
            <TouchableOpacity
              style={[styles.newButton, { backgroundColor: currentTheme.buttonBackground, marginLeft: 10 }]}
              onPress={() => navigateToEditor()}
            >
              <Text style={[styles.newButtonText, { color: currentTheme.buttonText }]}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );

    return (
      <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
        {searchTerm ? (
          <FlatList
            data={[...getSearchResults().genres, ...getSearchResults().lyrics]}
            renderItem={renderSearchResultItem}
            keyExtractor={(item, index) => {
              const searchResults = getSearchResults();
              if (index < searchResults.genres.length) {
                return `genre-${searchResults.genres[index]}`;
              } else {
                const lyricsIndex = index - searchResults.genres.length;
                return searchResults.lyrics[lyricsIndex].id;
              }
            }}
            style={styles.list}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={[...getSearchResults().genres, ...getSearchResults().lyrics].length === 0 ? styles.emptyContainer : styles.gridContainer}
            ListEmptyComponent={renderEmptyState}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <FlatList
            data={getGenres()}
            renderItem={renderGenreItem}
            keyExtractor={(item) => item}
            style={styles.list}
            numColumns={2}
            contentContainerStyle={getGenres().length === 0 ? styles.emptyContainer : styles.gridContainer}
            ListEmptyComponent={renderEmptyState}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    );
  };

  const renderEditorView = () => {
    const handleSave = () => {
      if (!currentLyrics) return;

      const updatedLyrics: Lyrics = {
        ...currentLyrics,
        title: editorTitle,
        content: editorContent,
        audioUri: editorAudioUri,
        audioFileName: editorAudioFileName,
        localPath: editorLocalPath,
        genre: editorGenre,
        scale: editorScale,
      };

      saveLyrics(updatedLyrics);
    };

    const onUploadAudio = async () => {
      const result = await pickAndCopyAudio();
      if (result) {
        setEditorAudioUri(result.audioUri);
        setEditorAudioFileName(result.audioFileName);
        setEditorLocalPath(result.localPath);
      }
    };

    const handleRemoveAudio = async () => {
      // Delete the audio file if it exists
      if (editorLocalPath) {
        await deleteAudioFile(editorLocalPath);
      }
      setEditorAudioUri('');
      setEditorAudioFileName('');
      setEditorLocalPath('');
    };

    return (
      <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
        <View style={[styles.header, { backgroundColor: currentTheme.headerBackground, borderBottomColor: currentTheme.border }]}>
          <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
            <Text style={[styles.backButtonIcon, { color: currentTheme.text }]}>‹</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.titleInput, { backgroundColor: currentTheme.inputBackground, borderColor: currentTheme.border, color: currentTheme.text }]}
            placeholder="Song Title"
            placeholderTextColor={currentTheme.textSecondary}
            value={editorTitle}
            onChangeText={setEditorTitle}
          />
          <TouchableOpacity style={[styles.saveButton, { backgroundColor: currentTheme.buttonBackground }]} onPress={handleSave}>
            <Text style={[styles.saveButtonText, { color: currentTheme.buttonText }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={[styles.content, { backgroundColor: currentTheme.background }]}
          scrollEnabled={!showGenreDropdown && !showScaleDropdown}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.genreKeyRow}>
            <View style={styles.genreSection}>
              <Text style={[styles.genreLabel, { color: currentTheme.text }]}>Genre</Text>
              <View style={styles.genreInputContainer}>
                <TextInput
                  style={[styles.genreInput, { backgroundColor: currentTheme.inputBackground, borderColor: currentTheme.border, color: currentTheme.text }]}
                  placeholder="Enter genre (e.g., Rock, Pop, Jazz)"
                  placeholderTextColor={currentTheme.textSecondary}
                  value={editorGenre}
                  onChangeText={handleGenreInputChange}
                  onFocus={() => {
                    setShowGenreDropdown(true);
                    setShowScaleDropdown(false); // Hide scale dropdown when genre is focused
                    filterGenres(editorGenre);
                  }}
                  onBlur={() => {
                    // Delay hiding to allow selection
                    setTimeout(() => setShowGenreDropdown(false), 200);
                  }}
                />
                {showGenreDropdown && (
                  <View style={[styles.genreDropdown, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border, opacity: 1 }]}>
                    <ScrollView 
                      style={styles.genreDropdownScroll}
                      contentContainerStyle={styles.genreDropdownContent}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                      bounces={false}
                      scrollEnabled={true}
                      nestedScrollEnabled={true}
                    >
                      {filteredGenres.length > 0 ? (
                        filteredGenres.map((genre, index) => (
                          <TouchableOpacity
                            key={genre}
                            style={[
                              styles.genreOption, 
                              { 
                                borderBottomColor: currentTheme.border,
                                borderBottomWidth: index === filteredGenres.length - 1 ? 0 : 1
                              }
                            ]}
                            onPress={() => selectGenre(genre)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.genreOptionText, { color: currentTheme.text }]}>{genre}</Text>
                          </TouchableOpacity>
                        ))
                      ) : editorGenre.trim() ? (
                        <TouchableOpacity
                          style={[styles.genreOption, { borderBottomColor: currentTheme.border, borderBottomWidth: 0 }]}
                          onPress={createNewGenre}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.genreOptionText, { color: currentTheme.accent }]}>
                            Create "{editorGenre.trim()}"
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.scaleSection}>
              <Text style={[styles.scaleLabel, { color: currentTheme.text }]}>Key</Text>
              <View style={styles.scaleInputContainer}>
                <TextInput
                  style={[styles.scaleInput, { backgroundColor: currentTheme.inputBackground, borderColor: currentTheme.border, color: currentTheme.text }]}
                  placeholder="Key"
                  placeholderTextColor={currentTheme.textSecondary}
                  value={editorScale}
                  onChangeText={handleScaleInputChange}
                  onFocus={() => {
                    setShowScaleDropdown(true);
                    setShowGenreDropdown(false); // Hide genre dropdown when scale is focused
                    filterScales(editorScale);
                  }}
                  onBlur={() => {
                    // Delay hiding to allow selection
                    setTimeout(() => setShowScaleDropdown(false), 200);
                  }}
                />
                {showScaleDropdown && (
                  <View style={[styles.scaleDropdown, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}>
                    <ScrollView 
                      style={styles.scaleDropdownScroll}
                      contentContainerStyle={styles.scaleDropdownContent}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                      bounces={false}
                      scrollEnabled={true}
                      nestedScrollEnabled={true}
                    >
                      {filteredScales.length > 0 ? (
                        filteredScales.map((scale, index) => (
                          <TouchableOpacity
                            key={scale}
                            style={[
                              styles.scaleOption, 
                              { 
                                borderBottomColor: currentTheme.border,
                                borderBottomWidth: index === filteredScales.length - 1 ? 0 : 1
                              }
                            ]}
                            onPress={() => selectScale(scale)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.scaleOptionText, { color: currentTheme.text }]}>{scale}</Text>
                          </TouchableOpacity>
                        ))
                      ) : editorScale.trim() ? (
                        <TouchableOpacity
                          style={[styles.scaleOption, { borderBottomColor: currentTheme.border, borderBottomWidth: 0 }]}
                          onPress={createNewScale}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.scaleOptionText, { color: currentTheme.accent }]}>
                            Create "{editorScale.trim()}"
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>
          </View>

          <TextInput
            style={[styles.contentInput, { backgroundColor: currentTheme.inputBackground, borderColor: currentTheme.border, color: currentTheme.text }]}
            placeholder="Write your lyrics here..."
            placeholderTextColor={currentTheme.textSecondary}
            value={editorContent}
            onChangeText={setEditorContent}
            multiline
            textAlignVertical="top"
          />

          <View style={[styles.mediaSection, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}>
            <Text style={[styles.mediaTitle, { color: currentTheme.text }]}>Audio</Text>
            <View style={[styles.mediaContainer, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]}>
              {editorAudioUri ? (
                <View style={styles.audioPlayerContainer}>
                  <Text style={[styles.audioFileName, { color: currentTheme.textSecondary }]}>{editorAudioFileName}</Text>
                  <View
                    style={styles.progressContainer}
                    onLayout={(e) => setEditorProgressWidth(e.nativeEvent.layout.width)}
                  >
                    <View
                      style={[styles.progressBar, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]}
                      onStartShouldSetResponder={() => true}
                      onResponderGrant={async (e) => {
                        setIsDragging(true);
                        setWasPlayingBeforeDrag(isPlaying);
                        const x = e.nativeEvent.locationX;
                        if (isPlaying) {
                          await pauseAudio();
                        }
                        handleSeekByX(x, editorProgressWidth);
                      }}
                      onResponderMove={(e) => handleSeekByX(e.nativeEvent.locationX, editorProgressWidth)}
                      onResponderRelease={async () => {
                        setIsDragging(false);
                        if (wasPlayingBeforeDrag) {
                          await resumeAudio();
                        }
                      }}
                      onResponderTerminate={async () => {
                        setIsDragging(false);
                        if (wasPlayingBeforeDrag) {
                          await resumeAudio();
                        }
                      }}
                    >
                      <View 
                        style={[
                          styles.progressFill, 
                          { 
                            width: duration > 0 ? `${(position / duration) * 100}%` : '0%', 
                            backgroundColor: currentTheme.accent 
                          }
                        ]} 
                      />
                      <View
                        style={[
                          styles.progressHandle,
                          {
                            left: Math.max(0, Math.min(editorProgressWidth - 12, getHandleLeft(editorProgressWidth) - 6)),
                            transform: [{ scale: isDragging ? 1.2 : 1 }],
                            backgroundColor: currentTheme.accent,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.timeContainer}>
                      <Text style={[styles.timeText, { color: currentTheme.textSecondary }]}>{formatTime(position)}</Text>
                      <Text style={[styles.timeText, { color: currentTheme.textSecondary }]}>{formatTime(duration)}</Text>
                    </View>
                  </View>
                  <View style={styles.audioControls}>
                    <TouchableOpacity style={[styles.skipButton, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]} onPress={skipBackward}>
                      <Text style={[styles.skipButtonText, { color: currentTheme.accent }]}>⏪</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.audioButton, { backgroundColor: currentTheme.buttonBackground }]} 
                      onPress={isPlaying ? pauseAudio : () => playAudio(editorAudioUri, editorLocalPath)}
                    >
                      <Text style={[styles.audioButtonText, { color: currentTheme.buttonText }]}>
                        {isPlaying ? '⏸️' : '▶️'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.audioButton, { backgroundColor: currentTheme.buttonBackground }]} onPress={stopAudio}>
                      <Text style={[styles.audioButtonText, { color: currentTheme.buttonText }]}>⏹️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.skipButton, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]} onPress={skipForward}>
                      <Text style={[styles.skipButtonText, { color: currentTheme.accent }]}>⏩</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.removeButton, { backgroundColor: '#ef4444' }]} onPress={handleRemoveAudio}>
                      <Text style={[styles.removeButtonText, { color: '#ffffff' }]}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.mediaPlaceholder}>
                  <Text style={[styles.mediaIcon, { color: currentTheme.accent }]}>🎵</Text>
                  <Text style={[styles.mediaText, { color: currentTheme.textSecondary }]}>No audio attached</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={[styles.uploadButton, { backgroundColor: currentTheme.surface, borderColor: currentTheme.accent }]} onPress={onUploadAudio}>
              <Text style={[styles.uploadButtonText, { color: currentTheme.accent }]}>📤 Upload Audio</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderViewerView = () => {
    if (!currentLyrics) {
  return (
    <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
          <Text style={[styles.errorText, { color: currentTheme.textSecondary }]}>No lyrics selected</Text>
    </View>
  );
}

    return (
      <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
        <View style={[styles.header, { backgroundColor: currentTheme.headerBackground, borderBottomColor: currentTheme.border }]}>
          <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
            <Text style={[styles.backButtonIcon, { color: currentTheme.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: currentTheme.text }]}>{currentLyrics.title || 'Untitled'}</Text>
          <TouchableOpacity style={[styles.editButton, { backgroundColor: currentTheme.buttonBackground }]} onPress={() => navigateToEditor(currentLyrics)}>
            <Text style={[styles.editButtonText, { color: currentTheme.buttonText }]}>✏️</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={[styles.content, { backgroundColor: currentTheme.background }]}>
          <Text style={[styles.lyricsText, { color: currentTheme.text }]}>{currentLyrics.content}</Text>

          {currentLyrics.audioUri && (
            <View style={[styles.mediaSection, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}>
              <Text style={[styles.mediaTitle, { color: currentTheme.text }]}>Audio Player</Text>
              <View style={[styles.audioPlayerContainer, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]}>
                <Text style={[styles.audioFileName, { color: currentTheme.textSecondary }]}>{currentLyrics.audioFileName}</Text>
                <View
                  style={styles.progressContainer}
                  onLayout={(e) => setViewerProgressWidth(e.nativeEvent.layout.width)}
                >
                  <View
                    style={[styles.progressBar, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]}
                    onStartShouldSetResponder={() => true}
                    onResponderGrant={async (e) => {
                      setIsDragging(true);
                      setWasPlayingBeforeDrag(isPlaying);
                      const x = e.nativeEvent.locationX;
                      if (isPlaying) {
                        await pauseAudio();
                      }
                      handleSeekByX(x, viewerProgressWidth);
                    }}
                    onResponderMove={(e) => handleSeekByX(e.nativeEvent.locationX, viewerProgressWidth)}
                    onResponderRelease={async () => {
                      setIsDragging(false);
                      if (wasPlayingBeforeDrag) {
                        await resumeAudio();
                      }
                    }}
                    onResponderTerminate={async () => {
                      setIsDragging(false);
                      if (wasPlayingBeforeDrag) {
                        await resumeAudio();
                      }
                    }}
                  >
                    <View 
                      style={[
                        styles.progressFill, 
                        { width: duration > 0 ? `${(position / duration) * 100}%` : '0%', backgroundColor: currentTheme.accent }
                      ]} 
                    />
                    <View
                      style={[
                        styles.progressHandle,
                        {
                          left: Math.max(0, Math.min(viewerProgressWidth - 12, getHandleLeft(viewerProgressWidth) - 6)),
                          transform: [{ scale: isDragging ? 1.2 : 1 }],
                          backgroundColor: currentTheme.accent,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.timeContainer}>
                    <Text style={[styles.timeText, { color: currentTheme.textSecondary }]}>{formatTime(position)}</Text>
                    <Text style={[styles.timeText, { color: currentTheme.textSecondary }]}>{formatTime(duration)}</Text>
                  </View>
                </View>
                <View style={styles.audioControls}>
                  <TouchableOpacity style={[styles.skipButton, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]} onPress={skipBackward}>
                    <Text style={[styles.skipButtonText, { color: currentTheme.accent }]}>⏪</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.audioButton, { backgroundColor: currentTheme.buttonBackground }]} 
                    onPress={() => {
                      if (isPlaying) {
                        pauseAudio();
                      } else if (sound) {
                        resumeAudio();
                      } else if (currentLyrics?.audioUri) {
                        playAudio(currentLyrics.audioUri);
                      }
                    }}
                  >
                    <Text style={[styles.audioButtonText, { color: currentTheme.buttonText }]}>
                      {isPlaying ? '⏸️' : '▶️'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.audioButton, { backgroundColor: currentTheme.buttonBackground }]} onPress={stopAudio}>
                    <Text style={[styles.audioButtonText, { color: currentTheme.buttonText }]}>⏹️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.skipButton, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]} onPress={skipForward}>
                    <Text style={[styles.skipButtonText, { color: currentTheme.accent }]}>⏩</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.audioControls}>
                <TouchableOpacity style={[styles.skipButton, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]} onPress={skipBackward}>
                  <Text style={[styles.skipButtonText, { color: currentTheme.accent }]}>⏪</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.audioButton, { backgroundColor: currentTheme.buttonBackground }]} 
                  onPress={() => {
                    if (isPlaying) {
                      pauseAudio();
                    } else if (sound) {
                      resumeAudio();
                    } else if (currentLyrics?.audioUri) {
                      playAudio(currentLyrics.audioUri, currentLyrics.localPath);
                    }
                  }}
                >
                  <Text style={[styles.audioButtonText, { color: currentTheme.buttonText }]}>
                    {isPlaying ? '⏸️' : '▶️'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.audioButton, { backgroundColor: currentTheme.buttonBackground }]} onPress={stopAudio}>
                  <Text style={[styles.audioButtonText, { color: currentTheme.buttonText }]}>⏹️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.skipButton, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]} onPress={skipForward}>
                  <Text style={[styles.skipButtonText, { color: currentTheme.accent }]}>⏩</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <ScrollView 
          style={[styles.content, { backgroundColor: currentTheme.background }]}
          contentContainerStyle={styles.lyricsScrollContent}
          showsVerticalScrollIndicator={true}
        >
          <View style={[styles.lyricsInfoSection, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]}>
            <View style={styles.lyricsInfoRow}>
              <Text style={[styles.lyricsInfoLabel, { color: currentTheme.textSecondary }]}>Genre:</Text>
              <Text style={[styles.lyricsInfoValue, { color: currentTheme.text }]}>{currentLyrics.genre}</Text>
            </View>
            <View style={styles.lyricsInfoRow}>
              <Text style={[styles.lyricsInfoLabel, { color: currentTheme.textSecondary }]}>Key:</Text>
              <Text style={[styles.lyricsInfoValue, { color: currentTheme.text }]}>{currentLyrics.scale}</Text>
            </View>
          </View>
          <Text style={[styles.lyricsText, { color: currentTheme.text }]}>{currentLyrics.content}</Text>
        </ScrollView>
      </View>
    );
  };

  const renderGenreView = () => (
    <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
      <View style={[styles.header, { backgroundColor: currentTheme.headerBackground, borderBottomColor: currentTheme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={navigateToList}>
          <Text style={[styles.backButtonIcon, { color: currentTheme.text }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: currentTheme.text }]}>{selectedGenre}</Text>
        </View>
        <TouchableOpacity style={[styles.newButton, { backgroundColor: currentTheme.buttonBackground }]} onPress={() => navigateToEditor()}>
          <Text style={[styles.newButtonText, { color: currentTheme.buttonText }]}>+ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={getLyricsByGenre(selectedGenre)}
        renderItem={renderLyricsItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={getLyricsByGenre(selectedGenre).length === 0 ? styles.emptyContainer : styles.gridContainer}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon, { color: currentTheme.accent }]}>🎵</Text>
            <Text style={[styles.emptyText, { color: currentTheme.textSecondary }]}>No songs in {selectedGenre} genre yet.</Text>
          </View>
        )}
      />
    </View>
  );

  const renderSettingsView = () => (
    <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
      <View style={[styles.header, { backgroundColor: currentTheme.headerBackground, borderBottomColor: currentTheme.border }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: currentTheme.surface }]} onPress={navigateBack}>
          <Text style={[styles.backButtonIcon, { color: currentTheme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentTheme.text }]}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.settingsSection}>
          <Text style={[styles.settingsSectionTitle, { color: currentTheme.text }]}>Appearance</Text>
          
          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: currentTheme.text }]}>Theme</Text>
            <TouchableOpacity 
              style={[styles.themeSelector, { backgroundColor: currentTheme.inputBackground, borderColor: currentTheme.border }]}
              onPress={() => setShowThemeDropdown(!showThemeDropdown)}
            >
              <Text style={[styles.themeSelectorText, { color: currentTheme.text }]}>
                {theme === 'light' ? '☀️ Light' : theme === 'dark' ? '🌙 Dark' : '📱 System'}
              </Text>
              <Text style={[styles.themeSelectorArrow, { color: currentTheme.textSecondary }]}>{showThemeDropdown ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            
            {showThemeDropdown && (
              <View style={[styles.themeDropdown, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}>
                <TouchableOpacity 
                  style={[styles.themeOption, theme === 'light' && styles.themeOptionSelected, { borderBottomColor: currentTheme.border }]}
                  onPress={() => {
                    setTheme('light');
                    setShowThemeDropdown(false);
                  }}
                >
                  <Text style={styles.themeOptionIcon}>☀️</Text>
                  <Text style={[styles.themeOptionText, { color: currentTheme.text }, theme === 'light' && styles.themeOptionTextSelected]}>Light</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.themeOption, theme === 'dark' && styles.themeOptionSelected, { borderBottomColor: currentTheme.border }]}
                  onPress={() => {
                    setTheme('dark');
                    setShowThemeDropdown(false);
                  }}
                >
                  <Text style={styles.themeOptionIcon}>🌙</Text>
                  <Text style={[styles.themeOptionText, { color: currentTheme.text }, theme === 'dark' && styles.themeOptionTextSelected]}>Dark</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.themeOption, theme === 'system' && styles.themeOptionSelected]}
                  onPress={() => {
                    setTheme('system');
                    setShowThemeDropdown(false);
                  }}
                >
                  <Text style={styles.themeOptionIcon}>📱</Text>
                  <Text style={[styles.themeOptionText, { color: currentTheme.text }, theme === 'system' && styles.themeOptionTextSelected]}>System</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const renderCurrentView = () => {
    switch (currentView) {
      case 'list':
        return renderListView();
      case 'genre':
        return renderGenreView();
      case 'editor':
        return renderEditorView();
      case 'viewer':
        return renderViewerView();
      case 'settings':
        return renderSettingsView();
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: currentTheme.background }]}>
      <StatusBar 
        hidden={true} 
        translucent={true}
        backgroundColor="transparent"
      />
      <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
        {renderCurrentView()}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'ios' ? 0 : 0, // No top padding for fullscreen
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  newButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  newButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  settingsButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  settingsButtonText: {
    fontSize: 18,
  },
  headerSpacer: {
    width: 48, // Same width as back button for alignment
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  list: {
    flex: 1,
    padding: 8,
  },
  gridContainer: {
    padding: 8,
  },
  row: {
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lyricsItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    margin: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    flex: 1,
    aspectRatio: 1,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  lyricsItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  lyricsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    flex: 1,
    lineHeight: 20,
  },
  audioIndicator: {
    fontSize: 18,
    color: '#8b5cf6',
  },
  lyricsPreview: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
    lineHeight: 16,
    flex: 1,
  },
  lyricsDate: {
    fontSize: 11,
    color: '#8b5cf6',
    fontWeight: '600',
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
    color: '#8b5cf6',
  },
  emptyText: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 26,
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
  },
  backButtonIcon: {
    fontSize: 24,
    fontWeight: '300',
    color: '#666666',
  },
  titleInput: {
    flex: 1,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    fontSize: 18,
    color: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  saveButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  contentInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000000',
    minHeight: 300,
    textAlignVertical: 'top',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  mediaSection: {
    marginTop: 20,
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mediaTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  mediaContainer: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  audioPlayerContainer: {
    alignItems: 'center',
  },
  audioFileName: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  progressContainer: {
    width: '100%',
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  progressHandle: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#8b5cf6',
    shadowColor: '#8b5cf6',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 3,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '600',
  },
  audioControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  audioButton: {
    backgroundColor: '#8b5cf6',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  audioButtonText: {
    fontSize: 22,
    color: '#ffffff',
  },
  skipButton: {
    backgroundColor: '#f8f9fa',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  skipButtonText: {
    fontSize: 18,
    color: '#8b5cf6',
  },
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mediaIcon: {
    fontSize: 40,
    marginBottom: 12,
    color: '#8b5cf6',
  },
  mediaText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadButtonText: {
    color: '#8b5cf6',
    fontWeight: '700',
    fontSize: 16,
  },
  removeButton: {
    backgroundColor: '#ef4444',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  removeButtonText: {
    fontSize: 22,
    color: '#ffffff',
  },
  title: {
    flex: 1,
    marginHorizontal: 16,
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
  },
  editButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  editButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  lyricsText: {
    fontSize: 18,
    lineHeight: 28,
    color: '#000000',
  },
  lyricsScrollContent: {
    flexGrow: 1,
    paddingBottom: 60,
    paddingTop: 20,
  },
  lyricsInfoSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  lyricsInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  lyricsInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  lyricsInfoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  errorText: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
    marginTop: 50,
    fontWeight: '600',
  },
  // Genre and Key row styles
  genreKeyRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 16,
  },
  // Genre styles
  genreItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    margin: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    flex: 1,
    aspectRatio: 1,
    minHeight: 160,
  },
  genreIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  genreIconText: {
    fontSize: 32,
    color: '#ffffff',
  },
  genreInfo: {
    alignItems: 'center',
    marginTop: 16,
  },
  genreName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
    textAlign: 'center',
    lineHeight: 20,
  },
  genreCount: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '600',
    textAlign: 'center',
  },
  genreArrow: {
    fontSize: 16,
    color: '#8b5cf6',
    marginTop: 4,
  },
  genreSection: {
    flex: 3,
    zIndex: 1000,
    elevation: 10,
  },
  genreLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  genreInputContainer: {
    position: 'relative',
    zIndex: 1000,
    elevation: 10,
  },
  genreInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  genreDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 15,
    zIndex: 1001,
    maxHeight: 150,
    overflow: 'hidden',
  },
  genreOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    minHeight: 48,
    justifyContent: 'center',
  },
  genreOptionText: {
    fontSize: 16,
    color: '#000000',
  },
  genreDropdownScroll: {
    maxHeight: 150,
    flexGrow: 0,
  },
  genreDropdownContent: {
    flexGrow: 0,
  },
  // Scale styles
  scaleSection: {
    flex: 1,
  },
  scaleLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  scaleInputContainer: {
    position: 'relative',
    zIndex: 500,
    elevation: 5,
  },
  scaleInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  scaleDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 1001,
    maxHeight: 150,
    overflow: 'hidden',
  },
  scaleOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    minHeight: 48,
    justifyContent: 'center',
  },
  scaleOptionText: {
    fontSize: 16,
    color: '#000000',
  },
  scaleDropdownScroll: {
    maxHeight: 150,
    flexGrow: 0,
  },
  scaleDropdownContent: {
    flexGrow: 0,
  },
  // Settings styles
  settingsSection: {
    marginBottom: 32,
  },
  settingsSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  settingItem: {
    marginBottom: 24,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  themeSelector: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  themeSelectorText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '600',
  },
  themeSelectorArrow: {
    fontSize: 12,
    color: '#666666',
  },
  themeDropdown: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  themeOptionSelected: {
    backgroundColor: '#f0f8ff',
  },
  themeOptionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  themeOptionText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
  themeOptionTextSelected: {
    color: '#8b5cf6',
    fontWeight: '700',
  },
});

export default App;