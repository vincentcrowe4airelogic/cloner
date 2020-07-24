import { Cred, Clone, CloneOptions } from "nodegit";
import fs from "fs";
import stream from "stream";
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
                return Cred.sshKeyNew('user', '/tmp/ssh/key.pub', '/tmp/ssh/key.prk', '');
            }
        }
    }
};

export const repoToBucket = async (
  event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    const repo = process.env.REPO!;
    const bucketName = process.env.BUCKET!;
    fs.mkdirSync("/tmp/ssh");
    fs.mkdirSync("/tmp/repo");
    fs.writeFileSync("/tmp/ssh/key.prk", await getParameter(`/ssh/${repo}/prk`));
    fs.writeFileSync("/tmp/ssh/key.pub", await getParameter(`/ssh/${repo}/pub`));
    await Clone.clone(`ssh://user@bitbucket.org/${repo}.git`, "/tmp/repo", options);
    await zipDirectory("/tmp/repo", "/tmp/repo.zip");
    const zipStream = fs.createReadStream("/tmp/repo.zip");

    const { s3Stream, awaiter} = uploadFromStream(bucketName, "repo.zip");
    zipStream.pipe(s3Stream);

    await awaiter;
    
    return {
      statusCode: 200,
      body: ""
    };
  }

const uploadFromStream = (bucketName: string, key: string) => {
  const s3Stream = new stream.PassThrough();
  const params = {Bucket: bucketName, Key: key, Body: s3Stream};
  const awaiter = s3.upload(params).promise();

  return {s3Stream, awaiter};
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