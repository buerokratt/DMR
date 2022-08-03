# DMR .NET Implementation

This repository currently houses an implementation of the DMR written in C# with .NET 6.0.

## Technologies Used and Their Function

.NET's [Web API](https://docs.microsoft.com/en-us/aspnet/core/web-api/?view=aspnetcore-6.0) is used to implement RESTful endpoints.
APIs are implemented with 'Controllers' which represent the operations one might perform on an entity managed by this service.

[Swagger](https://swagger.io/) implemented using the [Swashbuckle](https://github.com/domaindrivendev/Swashbuckle.AspNetCore) library produces OpenAPI Specs for the API and generates a simple user interface that allows endpoints within this project to be called when run in Debug mode.

[Microsoft.CodeAnalysis.NetAnalyzers](https://github.com/dotnet/roslyn-analyzers) are used to ensure best practice is used in code styling and language usage.  Violations of these rules will cause build failures.

[xUnit.Net](https://github.com/xunit/xunit) is a unit testing framework used by all tests.

[Coverlet](https://github.com/coverlet-coverage/coverlet) a unit test coverage measurement and reporting tool.  This project has a goal to meet at least 80% coverage.

[Stryker](https://stryker-mutator.io/) is a mutation testing framework used by this project to ensure tests written to meet coverage requirements are covering crucial areas.

## Implementation and Flow

The implementation of DMR is reasonably straightforward.

1. POST request is issued to the `/messages` endpoint by a Buerokratt participant.
    - Request headers are important here to indicate how the message should be routed.  These are covered in the [API Spec](./api-spec.yml).
2. The message is `Accepted` (HTTP Status 202) by the `MessagesController.PostAsync` method and enqueued (in-process) and processed asynchronously.
3. The enqueued request is dequeued and handled by the [MessageForwarderService.cs](../../src/Dmr.Api/Services/MessageForwarder/MessageForwarderService.cs) which is derived from the shared code in [Beurokratt.Common](https://github.com/buerokratt/Request-Processor).
4. The request is then sent on to a third party based on the `X-Send-To` header.  This could be another participant or a Classifier.
   - This service maintains a cache of participants using the ParticipantPoller from the Buerokratt.Common package.  This polls CentOps for updates on a periodic, configurable interval.  
   - Routing requests to intended participants specified by `X-Send-To` need to have a valid entry in this cache (which means they exist with the name specified and are currently 'Available' to receive traffic) to succeed.
   - The participant being called on the initiator's behalf receives the original message and will also return `Accepted` for asynchronous processing.
5. In the event of an error attempting to call a participant (e.g. a missing destination participant or the participant returns an error when it's endpoint is called), DMR will respond directly to the participant who initiated the request (specified by the `X-Sent-By` header).

## Configuration

Configuration of this service can be done in many ways.  [appsettings.json](../../src/CentOps.Api/appsettings.json) is one approach which will be used in local development.  Another is using specifically named environment variables.  Both approaches are documented below.

> Note. This form of configuration is a part of .Net's configuration and the technique to implement this configuration via environment variables is documented [here](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/configuration/?view=aspnetcore-6.0#naming-of-environment-variables).

### DmrServiceSettings

| Setting    | Purpose                  |  appsettings.json | yaml environment |
|-----------|-------------------------| ------------------|--------|
| CentOpsUri | Specifies the endpoint for the CentOps service |"CentOpsUri": "`https://centops`" | DMRSERVICESETTINGS__CENTOPSURI=`https://centops` |
| CentOpsApiKey | The Participant key this DMR instance will use to communicate with CentOps | "CentOpsApiKey": "`ParticipantKey`" | DMRSERVICESETTINGS__CENTOPSAPIKEY=`ParticipantKey` |
| ParticipantCacheRefreshIntervalMs | The interval at which to update the CentOps participant cache (5000ms by default) | "ParticipantCacheRefreshIntervalMs": `2000` | DMRSERVICESETTINGS__PARTICIPANTREFRESHINTERVAL=`2000` |

## Notes

Another implementation of the DMR exists which uses Nginx [here](https://github.com/buerokratt/DMR-Nginx).  However, at the time of writing the .NET implementation was the primary one being used.
