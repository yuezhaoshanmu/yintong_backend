import { imageAssets } from "../data/imageAssets";

export function getTaskItemImage(label: string): string {
  if (label === "白兔糖") return imageAssets.objects.whiteRabbitCandy;
  if (label === "玻璃罐") return imageAssets.objects.glassJar;
  if (label === "供销社") return imageAssets.objects.supplyCooperative;
  if (label === "平板电脑") return imageAssets.objects.tablet;
  if (label === "披萨") return imageAssets.objects.pizza;
  if (label === "飞机") return imageAssets.objects.airplane;

  if (label.includes("收音机")) return imageAssets.objects.oldRadio;
  if (label.includes("天线")) return imageAssets.objects.radioAntenna;
  if (label.includes("旋钮")) return imageAssets.objects.radioKnob;
  if (label.includes("相册") || label.includes("照片") || label.includes("相框")) return imageAssets.objects.familyAlbum;
  if (label.includes("自行车") || label.includes("车铃") || label.includes("车把") || label.includes("车轮")) {
    return imageAssets.objects.oldBicycle;
  }
  if (label.includes("缝纫机")) return imageAssets.objects.sewingMachine;
  if (label.includes("糖纸") || label.includes("糖果")) return imageAssets.objects.candyJar;
  if (label.includes("风扇")) return imageAssets.objects.deskFan;
  if (label.includes("搪瓷杯")) return imageAssets.objects.enamelCup;
  if (label.includes("暖水瓶")) return imageAssets.objects.thermosBottle;

  return imageAssets.objects.placeholder;
}
