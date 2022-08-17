export class Pack {
  data: any;
  name: string = "";
  description: string = "";
  packPath: string = "";
  ignore: string[] = [];

  init() {
    this.name = this.data.name;
    this.description = this.data.description;
    this.packPath = this.data.packPath.split("/").pop();
    this.ignore = this.data.ignore;
  }
}
