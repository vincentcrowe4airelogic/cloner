import { Cred, Clone, CloneOptions } from "nodegit";
import fs from "fs";
import archiver from "archiver";
import AWS from "aws-sdk";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const ssm = new AWS.SSM();
const s3 = new AWS.S3();

const options : CloneOptions = {
    fetchOpts: {
        callbacks: {
            certificateCheck: function() { return 0; },
            credentials: function() {
                return Cred.sshKeyNew('user', './key.pub', './key.prk', '');
            }
        }
    }
};

export const repoToBucket = async (
  event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    const repo = process.env.REPO!;
    const bucketName = process.env.BUCKET!;
    fs.writeFileSync("./key.prk", await getParameter(`/ssh/${repo}/prk`));
    fs.writeFileSync("./key.pub", await getParameter(`/ssh/${repo}/pub`));
    await Clone.clone(`ssh://user@bitbucket.org/${repo}.git`, "repo", options);
    zipDirectory("repo", "repo.zip");
    await s3.upload({
        Bucket: bucketName,
        Key: "repo.zip"
    }).promise();

    return {
      statusCode: 200,
      body: ""
    };
  }

export const test = async (
  event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    console.log(JSON.stringify(event))
    return {
      statusCode: 200,
      body: ""
    }
}

const getParameter = (key: string) : Promise<string> => {
    return ssm.getParameter({ Name: key}).promise().then(
            res => res.Parameter?.Value!
        )    
}

const zipDirectory = (source: string, out: string) => {
  const archive = archiver('zip', { zlib: { level: 9 }});
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream)
    ;

    stream.on('close', () => resolve());
    archive.finalize();
  });
}