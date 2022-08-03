# Introduction

[![DMR CI Pipeline](https://github.com/buerokratt/DMR/actions/workflows/ci-pullrequest-main.yml/badge.svg)](https://github.com/buerokratt/DMR/actions/workflows/ci-pullrequest-main.yml)

A repository for the .NET implementation of the Distributed Message Room (DMR) component in the Bürokratt project.

This implementation of DMR will take routing requests and return 202 Accepted.  Processing of these requests will occur asynchronously of the routing request.

## Configuration

Configuration settings are as follows:

Current ```appsettings.json```

```json
  "DmrServiceSettings": {
    "CentOpsUri": "http://127.0.0.1:8080",
    "CentOpsApiKey": "<PARTICIPANT KEY CREATED BY CENTOPS ADMIN>",
  }
```

### DmrServiceSetttings

Name           | Description
-------------- | -------------------
CentOpsUri     | Endpoint of the CentOps service.
CentOpsApiKey  | The Participant API Key created by CentOps Administrator.

## Implementation

Find notes on the .NET implementation of the DMR [here](/docs/technical/implementation.md).
