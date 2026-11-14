import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type IdeaAction = 'rename' | 'duplicate' | 'delete';

/** Asks before deleting an idea and its recordings. */
export function confirmDeleteIdea(name: string, onConfirm: () => void) {
  Alert.alert(
    `Delete “${name}”?`,
    'The idea and its recordings will be deleted. This can’t be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ],
  );
}

/** The long-press menu on an idea row: an action sheet on iOS, a three-button alert on Android. */
export function showIdeaMenu(name: string, onSelect: (action: IdeaAction) => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: name,
        options: ['Rename', 'Duplicate', 'Delete', 'Cancel'],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
      },
      (index) => {
        const action = (['rename', 'duplicate', 'delete'] as const)[index];
        if (action) onSelect(action);
      },
    );
    return;
  }
  Alert.alert(name, undefined, [
    { text: 'Rename', onPress: () => onSelect('rename') },
    { text: 'Duplicate', onPress: () => onSelect('duplicate') },
    { text: 'Delete', style: 'destructive', onPress: () => onSelect('delete') },
  ]);
}
