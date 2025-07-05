import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export const useImagePicker = ({ setFiles }) => {
  const handleImagePick = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Camera roll permissions are required.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const imageFile = {
          uri: asset.uri,
          type: 'image/jpeg',
          name: asset.fileName || 'image.jpg',
        };

        setFiles(prev => ({ ...prev, profilePicture: imageFile }));
      }
    } catch (error) {
      console.error('Image picking error:', error);
      Alert.alert('Error', 'Something went wrong while picking the image.');
    }
  };

  return { handleImagePick };
};