export class Pack {
  data: any;
  name: string = "";
  description: string = "";
  path: string = "";
  ignore: string[] = [];
  version: string = "v1.0";
  author: string = "";

  // This init function is called by the setter function in GlobalState
  init() {
    this.name = this.data.name;
    this.description = this.data.description;
    this.path = this.data.packPath.split("/").pop();
    this.ignore = this.data.ignore;
    this.version = this.data.version;
    this.author = this.data.author;
  }
}
