package router

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// storageStallTimeout is how long a connection to Garage may go without any
// bytes moving before it is treated as dead. It bounds inactivity, not total
// duration, so long uploads that keep making progress are never cut off.
const storageStallTimeout = 60 * time.Second

// s3HTTPClient is shared by every S3 client so connections are pooled.
var s3HTTPClient aws.HTTPClient = newStallTimeoutHTTPClient(storageStallTimeout)

// newStallTimeoutHTTPClient returns an HTTP client whose connections fail
// once no data has been read or written for the given duration. Without it a
// Garage node that stops responding (but keeps the TCP connection open) would
// hang uploads forever instead of surfacing an error.
func newStallTimeoutHTTPClient(timeout time.Duration) aws.HTTPClient {
	return awshttp.NewBuildableClient().WithTransportOptions(func(tr *http.Transport) {
		dial := tr.DialContext
		if dial == nil {
			dial = (&net.Dialer{Timeout: 30 * time.Second}).DialContext
		}
		tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
			conn, err := dial(ctx, network, addr)
			if err != nil {
				return nil, err
			}
			return &stallTimeoutConn{Conn: conn, timeout: timeout}, nil
		}
	})
}

// stallTimeoutConn pushes the connection deadline forward on every read or
// write, so it only expires when traffic stops in both directions.
type stallTimeoutConn struct {
	net.Conn
	timeout time.Duration
}

func (c *stallTimeoutConn) Read(b []byte) (int, error) {
	c.Conn.SetDeadline(time.Now().Add(c.timeout))
	return c.Conn.Read(b)
}

func (c *stallTimeoutConn) Write(b []byte) (int, error) {
	c.Conn.SetDeadline(time.Now().Add(c.timeout))
	return c.Conn.Write(b)
}

func newS3Client(endpoint, region string, creds aws.CredentialsProvider) *s3.Client {
	// Determine whether to disable HTTPS
	disableHTTPS := !strings.HasPrefix(endpoint, "https://")

	// AWS config without BaseEndpoint
	awsConfig := aws.Config{
		Credentials: creds,
		Region:      region,
		HTTPClient:  s3HTTPClient,
	}

	// Build S3 client with custom endpoint resolver for proper signing
	return s3.NewFromConfig(awsConfig, func(o *s3.Options) {
		o.UsePathStyle = true
		o.EndpointOptions.DisableHTTPS = disableHTTPS
		o.EndpointResolver = s3.EndpointResolverFunc(func(region string, opts s3.EndpointResolverOptions) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:           endpoint,
				SigningRegion: region,
			}, nil
		})
	})
}
