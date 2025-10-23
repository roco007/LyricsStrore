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
import * as FileSystem from 'expo-file-system';

interface Lyrics {
  id: string;
  title: string;
  content: string;
  audioUri?: string;
  audioFileName?: string;
  genre: string;
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
  const [originalView, setOriginalView] = useState<ViewType | null>(null);
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
  const [filteredGenres, setFilteredGenres] = useState<string[]>([]);

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
  const [editorGenre, setEditorGenre] = useState('');
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
      if (sound) {
        sound.unloadAsync();
      }
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

  const saveLyrics = async (lyrics: Lyrics) => {
    try {
      let updatedLyrics;
      if (editMode) {
        updatedLyrics = allLyrics.map(l => l.id === lyrics.id ? lyrics : l);
        setAllLyrics(updatedLyrics);
        await AsyncStorage.setItem('myLyrics', JSON.stringify(updatedLyrics));
        // After editing, go back to viewer mode
        setCurrentLyrics(lyrics);
        setCurrentView('viewer');
        setEditMode(false);
      } else {
        updatedLyrics = [...allLyrics, lyrics];
        setAllLyrics(updatedLyrics);
        await AsyncStorage.setItem('myLyrics', JSON.stringify(updatedLyrics));
        // After creating new, go to viewer mode of the new song
        setCurrentLyrics(lyrics);
        setCurrentView('viewer');
        setEditMode(false);
      }
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
      setEditorGenre(lyrics.genre || '');
    } else {
      setCurrentLyrics({
        id: Date.now().toString(),
        title: '',
        content: '',
        genre: 'General',
        createdAt: new Date().toISOString(),
      });
      setEditMode(false);
      setEditorTitle('');
      setEditorContent('');
      setEditorAudioUri('');
      setEditorAudioFileName('');
      setEditorGenre('General');
    }
    setCurrentView('editor');
  };

  const navigateToViewer = (lyrics: Lyrics) => {
    setPreviousView(currentView);
    // If coming from genre, remember the original view
    if (currentView === 'genre') {
      setOriginalView('genre');
    }
    setCurrentLyrics(lyrics);
    setPosition(0);
    setIsPlaying(false);
    setCurrentView('viewer');
  };

  const navigateToList = () => {
    setCurrentView('list');
    setPreviousView(null);
    setOriginalView(null);
    setCurrentLyrics(null);
    setEditMode(false);
    setSelectedGenre('');
    if (sound) {
      sound.unloadAsync();
      setSound(null);
      setIsPlaying(false);
    }
  };

  const navigateBack = () => {
    if (currentView === 'viewer' && originalView === 'genre') {
      // If we're in viewer and originally came from genre, go back to genre
      setCurrentView('genre');
      setOriginalView(null); // Clear original view after using it
    } else if (previousView === 'genre') {
      // If we came from genre view, go back to that specific genre
      setCurrentView('genre');
    } else if (previousView === 'viewer') {
      // If we came from viewer, go back to viewer
      setCurrentView('viewer');
    } else {
      // Otherwise go to main list
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

  const getRandomFunnyMessage = () => {
    const messages = [
      "Your music library is feeling a bit lonely! Time to add some tunes and make it sing! 🎤",
      "No songs yet? That's music to my ears... wait, that doesn't make sense! 🎵",
      "The silence is deafening! Let's add some lyrics to break it! 🎶",
      "Your playlist is emptier than a karaoke bar at 3 AM! Time to fill it up! 🎤",
      "Even crickets would be jealous of how quiet it is here! Add some songs! 🦗🎵",
      "This empty space is giving me stage fright! Help me out with some lyrics! 🎭",
      "Your music collection is so empty, it's echoing! Let's add some substance! 🏔️🎵"
    ];
    return messages[Math.floor(Math.random() * messages.length)];
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
      'Rock': '🎸',
      'Pop': '🎤',
      'Hip Hop': '🎧',
      'Jazz': '🎷',
      'Country': '🤠',
      'Electronic': '🎛️',
      'Classical': '🎼',
      'R&B': '🎵',
      'Blues': '🎶',
      'Folk': '🪕',
      'Garba': '💃',
      'Bollywood': '🎬',
      'Bhangra': '💃',
      'Sufi': '🎵',
      'Ghazal': '🎵',
      'Qawwali': '🎵',
    };
    if (!genre || typeof genre !== 'string') {
      return '🎵'; // Default icon if genre is invalid
    }
    return icons[genre as keyof typeof icons] || '🎵';
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

  // Pick and copy audio file to app cache
  const pickAndCopyAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/wav', 'audio/ogg'],
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        return { audioUri: file.uri, audioFileName: file.name };
      }
    } catch (error) {
      console.error('Error picking audio:', error);
      Alert.alert('Error', 'Failed to upload audio file');
    }
    return null;
  };

  const playAudio = async (audioUri: string) => {
    try {
      // If we already have a sound instance for this URI, just resume it
      if (sound && !isPlaying) {
        await sound.playAsync();
        setIsPlaying(true);
        return;
      }

      // If we have a different sound instance, unload it first
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      
      setSound(newSound);
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio');
    }
  };

  const pauseAudio = async () => {
    if (sound) {
      await sound.pauseAsync();
      setIsPlaying(false);
    }
  };

  const resumeAudio = async () => {
    if (sound) {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  const stopAudio = async () => {
    if (sound) {
      await sound.stopAsync();
      setIsPlaying(false);
      setPosition(0);
    }
  };

  const skipBackward = async () => {
    if (!sound || !duration) return;
    const newPosition = Math.max(0, position - 10000); // 10 seconds back
    try {
      await sound.setPositionAsync(newPosition);
      setPosition(newPosition);
    } catch (e) {}
  };

  const skipForward = async () => {
    if (!sound || !duration) return;
    const newPosition = Math.min(duration, position + 10000); // 10 seconds forward
    try {
      await sound.setPositionAsync(newPosition);
      setPosition(newPosition);
    } catch (e) {}
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
      await sound.setPositionAsync(target);
      setPosition(target);
    } catch (e) {}
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
          if (item.id === 'default-reference-song' || item.id === 'default-sample-song') {
            Alert.alert(
              'Default Song',
              'This is a default song that helps you understand how the app works. You can edit it but not delete it.',
              [
                { text: 'OK', style: 'default' },
                { text: 'Edit', style: 'default', onPress: () => navigateToEditor(item) },
              ]
            );
          } else {
            Alert.alert(
              'Delete Lyrics',
              `Are you sure you want to delete "${item.title || 'Untitled'}"?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteLyrics(item.id) },
              ]
            );
          }
        }}
      >
        <View style={styles.lyricsItemHeader}>
          <View style={styles.titleContainer}>
            <Text style={[styles.lyricsTitle, { color: currentTheme.text }]} numberOfLines={2}>
              {item.title || 'Untitled'}
            </Text>
            {(item.id === 'default-reference-song' || item.id === 'default-sample-song') && (
              <View style={[styles.referenceBadge, { backgroundColor: currentTheme.accent + '20', borderColor: currentTheme.accent }]}>
                <Text style={[styles.referenceBadgeText, { color: currentTheme.accent }]}>DEF</Text>
              </View>
            )}
          </View>
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
    <View style={[styles.emptyState, { backgroundColor: currentTheme.background }]}>
      <View style={[styles.emptyStateContainer, { backgroundColor: currentTheme.surface }]}>
        <View style={[styles.emptyIconContainer, { backgroundColor: currentTheme.primary + '15' }]}>
          <Text style={[styles.emptyIcon, { color: currentTheme.primary }]}>🎵</Text>
        </View>
        <Text style={[styles.emptyTitle, { color: currentTheme.text }]}>
          {searchTerm ? 'No Results Found' : '🎵 Waiting for songs to be added... 🎵'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: currentTheme.textSecondary }]}>
          {searchTerm 
            ? 'Try adjusting your search terms or browse all lyrics' 
            : getRandomFunnyMessage()
          }
        </Text>
      </View>
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
        <View key="header" style={[styles.header, { backgroundColor: currentTheme.headerBackground, borderBottomColor: currentTheme.border }, allLyrics.length === 0 && styles.headerSpaced]}>
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
        <View key="search" style={[styles.searchContainer, { backgroundColor: currentTheme.searchBackground, borderBottomColor: currentTheme.border }, allLyrics.length === 0 && styles.searchContainerSpaced]}>
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
        genre: editorGenre,
      };

      saveLyrics(updatedLyrics);
    };

    const onUploadAudio = async () => {
      const result = await pickAndCopyAudio();
      if (result) {
        setEditorAudioUri(result.audioUri);
        setEditorAudioFileName(result.audioFileName);
      }
    };

    const handleRemoveAudio = () => {
      setEditorAudioUri('');
      setEditorAudioFileName('');
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
          scrollEnabled={!showGenreDropdown}
          keyboardShouldPersistTaps="handled"
        >
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
                  filterGenres(editorGenre);
                }}
                onBlur={() => {
                  // Delay hiding to allow selection
                  setTimeout(() => setShowGenreDropdown(false), 200);
                }}
              />
              {showGenreDropdown && (
                <View style={[styles.genreDropdown, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}>
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
                      onPress={isPlaying ? pauseAudio : () => playAudio(editorAudioUri)}
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

        {currentLyrics.audioUri && (
          <View style={[styles.mediaSection, { backgroundColor: currentTheme.cardBackground, borderColor: currentTheme.border }]}>
            {/* <Text style={[styles.mediaTitle, { color: currentTheme.text }]}>Audio Player</Text> */}
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
          </View>
        )}

        <ScrollView 
          style={[styles.content, { backgroundColor: currentTheme.background }]}
          contentContainerStyle={styles.lyricsScrollContent}
          showsVerticalScrollIndicator={true}
        >
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
          <View style={[styles.emptyState, { backgroundColor: currentTheme.background }]}>
            <View style={[styles.emptyStateContainer, { backgroundColor: currentTheme.surface }]}>
              <View style={[styles.emptyIconContainer, { backgroundColor: currentTheme.primary + '15' }]}>
                <Text style={[styles.emptyIcon, { color: currentTheme.primary }]}>🎵</Text>
              </View>
              <Text style={[styles.emptyTitle, { color: currentTheme.text }]}>
                🎭 No {selectedGenre} Songs Yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: currentTheme.textSecondary }]}>
                The {selectedGenre} section is taking a coffee break! ☕ Add some songs to wake it up! 🎶
              </Text>
            </View>
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
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  referenceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  referenceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24, // Match header horizontal padding
    paddingVertical: 20,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    borderRadius: 20,
    marginHorizontal: 0, // Remove horizontal margin to use parent padding
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emptyActions: {
    width: '100%',
  },
  emptyActionButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 26,
  },
  headerExpanded: {
    paddingVertical: 32,
    paddingTop: Platform.OS === 'ios' ? 80 : 40,
  },
  searchContainerExpanded: {
    padding: 24,
  },
  searchInputExpanded: {
    padding: 16,
    fontSize: 18,
  },
  newButtonExpanded: {
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  newButtonTextExpanded: {
    fontSize: 18,
  },
  headerSpaced: {
    paddingVertical: 40, // Increased vertical padding for empty state
    paddingTop: Platform.OS === 'ios' ? 80 : 40, // More top padding for iOS
  },
  searchContainerSpaced: {
    paddingVertical: 24, // Increased vertical padding for empty state
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
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  audioPlayerContainer: {
    alignItems: 'center',
    width: '100%',
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
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 16,
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
  errorText: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
    marginTop: 50,
    fontWeight: '600',
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
    marginBottom: 16,
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
    elevation: 8,
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