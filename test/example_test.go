package test

import (
	"github.com/stretchr/testify/assert"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

func TestExample(t *testing.T) {
	cwd, _ := os.Getwd()
	integration.ProgramTest(t, &integration.ProgramTestOptions{
		Quick:       true,
		SkipRefresh: true,
		Dir:         path.Join(filepath.Dir(cwd), "src"),
		Config: map[string]string{
			"namespace": "test-pulumi",
			"env":       "local",
		},
		ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
			url := stack.Outputs["url"].(string)
			resp, err := http.Get(url)
			if !assert.NoError(t, err) {
				return
			}
			if !assert.Equal(t, 200, resp.StatusCode) {
				return
			}
			defer func(Body io.ReadCloser) {
				err := Body.Close()
				if err != nil {
					t.Errorf("failed to close response body: %v", err)
				}
			}(resp.Body)
			body, err := io.ReadAll(resp.Body)
			if !assert.NoError(t, err) {
				return
			}
			assert.Contains(t, string(body), "Hello")
		},
	})
}
