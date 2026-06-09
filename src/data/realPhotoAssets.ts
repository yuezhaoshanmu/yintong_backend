import { imageAssets } from "./imageAssets";

export const REAL_PHOTO_PLACEHOLDER = imageAssets.placeholders.story;

export const realPhotoAssets = {
  elder: {
    voiceRecordingPlaceholder: imageAssets.stories.familyAlbum,
    grandpaAvatar: imageAssets.avatars.grandpa,
    grandmaAvatar: imageAssets.avatars.grandma,
    parentAvatar: imageAssets.avatars.father,
    elderChildCall: imageAssets.background.familyAlbumTable,
  },
  memory: {
    oldRadio: imageAssets.stories.oldRadio,
    familyAlbum: imageAssets.stories.familyAlbum,
    oldLivingRoom: imageAssets.stories.familyAlbum,
    dinnerTable: imageAssets.stories.oldRadio,
    cooperativeStoreCandy: imageAssets.stories.candyJar,
    oldBicycle: imageAssets.stories.oldBicycle,
  },
  objects: {
    radio: imageAssets.objects.oldRadio,
    radioAntenna: imageAssets.objects.radioAntenna,
    radioKnob: imageAssets.objects.radioKnob,
    deskFan: imageAssets.objects.deskFan,
    candy: imageAssets.objects.candyJar,
    candyWrapper: imageAssets.objects.candyWrapper,
    glassJar: imageAssets.objects.candyJar,
    bicycle: imageAssets.objects.bicycle,
    bikeBell: imageAssets.objects.bicycleBell,
    bikeWheel: imageAssets.objects.bikeWheel,
    album: imageAssets.objects.familyAlbum,
    photoFrame: imageAssets.objects.photoFrame,
    diningTable: imageAssets.objects.diningTable,
    oldRoom: imageAssets.objects.oldRoom,
  },
  child: {
    childReadingAlbum: imageAssets.child.listeningStory,
    childListeningStory: imageAssets.child.listeningStory,
    familyLivingRoom: imageAssets.child.cardGame,
    childAvatar: imageAssets.avatars.childGirl,
  },
  placeholders: {
    neutral: imageAssets.placeholders.story,
  },
} as const;

export function photoWithFallback(path?: string): string {
  return path || REAL_PHOTO_PLACEHOLDER;
}
