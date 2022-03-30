import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as aws_route53 from "aws-cdk-lib/aws-route53";
import * as aws_certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as aws_route53_targets from "aws-cdk-lib/aws-route53-targets";
import * as dotenv from 'dotenv'
dotenv.config()
export class EasyquizAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Read from .env file
    const { 
      PORT, SECRET_KEY, DB_USER, DB_PWD, DB_HOST, 
      DB_PORT, DB_NAME, DB_DIALECT, HOST, EMAIL, 
      MAIL_HOST, MAIL_USER, MAIL_PASS, MAIL_PORT,
      VPC_DB, SG_DB, ENABLE_PLAYGROUND
    } = process.env;

    // Database VPC
    const vpc = ec2.Vpc.fromLookup(this, "EasyQuizVpc", {
      region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION ,
      vpcId: VPC_DB
    });

    const cluster = new ecs.Cluster(this, "EasyQuizCluster", {
      vpc: vpc,
    });

    const hostedZone = aws_route53.HostedZone.fromLookup(this, 'EasyQuizHostedZone', {
      domainName: 'easyquiz.click'
    });

    const certificate = new aws_certificatemanager.Certificate(this, 'EasyQuizCertificate', {
      domainName: '*.easyquiz.click',
      validation: aws_certificatemanager.CertificateValidation.fromDns(hostedZone)
    });

    // Create a load-balanced Fargate service and make it public
    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "EasyQuizFargateService", {
      certificate,
      cluster: cluster,
      desiredCount: 2,
      taskImageOptions: { 
        image: ecs.ContainerImage.fromRegistry("antoniocsjunior/easyquiz-graphql"),
        containerName: "easyquiz-graphql",
        environment: {
          PORT: PORT || '',
          SECRET_KEY: SECRET_KEY || '',
          DB_USER: DB_USER || '',
          DB_PWD: DB_PWD || '',
          DB_HOST: DB_HOST || '',
          DB_PORT: DB_PORT || '',
          DB_NAME: DB_NAME || '',
          DB_DIALECT: DB_DIALECT || '',
          HOST: HOST || '',
          EMAIL: EMAIL || '',
          MAIL_HOST: MAIL_HOST || '',
          MAIL_USER: MAIL_USER || '',
          MAIL_PASS: MAIL_PASS || '',
          MAIL_PORT: MAIL_PORT || '',
          ENABLE_PLAYGROUND: ENABLE_PLAYGROUND || ''
        },
        containerPort: parseInt(PORT || ''),
      },
      assignPublicIp: true,
      publicLoadBalancer: true,
    });

    new aws_route53.ARecord(this, 'EasyQuizDnsRecord', {
      recordName: 'api',
      zone: hostedZone,
      target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(service.loadBalancer)),
      ttl: Duration.minutes(1)
    });

    const importedSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'database-security-group',
      SG_DB as string,
      { allowAllOutbound: false }
    );

    service.service.connections.allowTo(importedSecurityGroup,  ec2.Port.tcp(parseInt(DB_PORT || '')))

    service.targetGroup.configureHealthCheck({
      path: "/check",
      enabled: true,
      healthyHttpCodes: '200'
    });
  }
}
