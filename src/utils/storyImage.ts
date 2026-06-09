import { imageAssets } from "../data/imageAssets";
import { MemoryStory } from "../types";

type StoryImageInput = Partial<Pick<MemoryStory, "imageUrl" | "title" | "summary" | "fullText">>;

export function getStoryImage(story: StoryImageInput): string {
  if (story.imageUrl) return story.imageUrl;

  const text = `${story.title ?? ""} ${story.summary ?? ""} ${story.fullText ?? ""}`;
  if (text.includes("收音机") || text.includes("广播")) return imageAssets.stories.oldRadio;
  if (text.includes("相册") || text.includes("照片") || text.includes("老屋")) return imageAssets.stories.familyAlbum;
  if (text.includes("自行车") || text.includes("车铃") || text.includes("巷子")) return imageAssets.stories.oldBicycle;
  if (text.includes("缝纫机") || text.includes("衣服") || text.includes("布料")) return imageAssets.stories.sewingMachine;
  if (text.includes("糖") || text.includes("糖果") || text.includes("玻璃罐") || text.includes("供销社")) {
    return imageAssets.stories.candyJar;
  }

  return imageAssets.stories.placeholder;
}
